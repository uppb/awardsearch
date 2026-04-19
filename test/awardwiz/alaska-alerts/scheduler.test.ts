import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AlaskaAlert } from "../../../awardwiz/backend/alaska-alerts/types.js"

type StoredDoc = Record<string, unknown>

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

class FakeDocRef {
  constructor(private readonly store: Map<string, StoredDoc>, readonly id: string) {}

  async get() {
    return new FakeDocSnapshot(this.id, this.store.get(this.id), this)
  }

  async set(value: StoredDoc) {
    this.store.set(this.id, clone(value))
  }

  async update(value: StoredDoc) {
    const current = this.store.get(this.id)
    if (!current)
      throw new Error(`document ${this.id} does not exist`)

    this.store.set(this.id, {
      ...clone(current),
      ...clone(value),
    })
  }
}

class FakeDocSnapshot {
  constructor(readonly id: string, private readonly value: StoredDoc | undefined, readonly ref: FakeDocRef) {}

  data() {
    return this.value === undefined ? undefined : clone(this.value)
  }
}

class FakeQuerySnapshot {
  constructor(readonly docs: FakeDocSnapshot[]) {}
}

class FakeQuery {
  constructor(
    protected readonly store: Map<string, StoredDoc>,
    private readonly filters: Array<{ field: string, operator: "==" | "<=", value: unknown }> = [],
    private readonly orderings: Array<{ field: string, direction: "asc" | "desc" }> = [],
    private readonly maxResults = Number.POSITIVE_INFINITY,
    private readonly startAfterDoc: FakeDocSnapshot | undefined = undefined,
  ) {}

  where(field: string, operator: "==" | "<=", value: unknown) {
    return new FakeQuery(this.store, [...this.filters, { field, operator, value }], this.orderings, this.maxResults, this.startAfterDoc)
  }

  orderBy(field: string, direction: "asc" | "desc" = "asc") {
    return new FakeQuery(this.store, this.filters, [...this.orderings, { field, direction }], this.maxResults, this.startAfterDoc)
  }

  limit(maxResults: number) {
    return new FakeQuery(this.store, this.filters, this.orderings, maxResults, this.startAfterDoc)
  }

  startAfter(doc: FakeDocSnapshot) {
    return new FakeQuery(this.store, this.filters, this.orderings, this.maxResults, doc)
  }

  async get() {
    return this.execute()
  }

  async execute() {
    const docs = Array.from(this.store.entries())
      .filter(([, value]) => this.filters.every(({ field, operator, value: expectedValue }) => {
        const actualValue = value[field]
        if (operator === "==")
          return actualValue === expectedValue

        return typeof actualValue === "string" && typeof expectedValue === "string" && actualValue <= expectedValue
      }))
      .sort(([leftId, leftValue], [rightId, rightValue]) => compareDocs(leftId, leftValue, rightId, rightValue, this.orderings))
      .filter(([id, value]) => {
        if (!this.startAfterDoc)
          return true

        return compareDocs(id, value, this.startAfterDoc.id, this.startAfterDoc.data()!, this.orderings) > 0
      })
      .slice(0, this.maxResults)
      .map(([id, value]) => new FakeDocSnapshot(id, value, new FakeDocRef(this.store, id)))

    return new FakeQuerySnapshot(docs)
  }
}

class FakeCollectionRef extends FakeQuery {
  constructor(protected override readonly store: Map<string, StoredDoc>) {
    super(store)
  }

  doc(id: string) {
    return new FakeDocRef(this.store, id)
  }
}

class FakeFirestore {
  private readonly collections = new Map<string, Map<string, StoredDoc>>()

  reset() {
    this.collections.clear()
  }

  collection(name: string) {
    if (!this.collections.has(name))
      this.collections.set(name, new Map())
    return new FakeCollectionRef(this.collections.get(name)!)
  }

  async runTransaction<T>(callback: (transaction: {
    get: (target: FakeDocRef | FakeQuery) => Promise<FakeDocSnapshot | FakeQuerySnapshot>
    update: (docRef: FakeDocRef, value: StoredDoc) => void
  }) => Promise<T>) {
    const writes: Array<() => Promise<void>> = []
    const transaction = {
      get: async (target: FakeDocRef | FakeQuery) => {
        if (target instanceof FakeDocRef)
          return target.get()

        return target.execute()
      },
      update: (docRef: FakeDocRef, value: StoredDoc) => {
        writes.push(() => docRef.update(value))
      },
    }

    const result = await callback(transaction)
    for (const write of writes)
      await write()

    return result
  }
}

const compareDocs = (
  leftId: string,
  leftValue: StoredDoc,
  rightId: string,
  rightValue: StoredDoc,
  orderings: Array<{ field: string, direction: "asc" | "desc" }>,
) => {
  for (const { field, direction } of orderings) {
    const left = leftValue[field]
    const right = rightValue[field]
    if (left === right)
      continue

    const comparison = `${left ?? ""}`.localeCompare(`${right ?? ""}`)
    return direction === "asc" ? comparison : -comparison
  }

  return leftId.localeCompare(rightId)
}

const fakeFirestore = new FakeFirestore()

vi.mock("firebase-admin", () => ({
  default: {
    firestore: vi.fn(() => fakeFirestore),
  },
}))

vi.mock("../../../awardwiz/backend/alaska-alerts/firebase-admin.js", () => ({
  getFirebaseAdminApp: vi.fn(() => ({ name: "test-app" })),
}))

const { claimDueAlerts } = await import("../../../awardwiz/backend/alaska-alerts/scheduler.js")

const buildAlert = (overrides: Partial<AlaskaAlert> = {}): AlaskaAlert => ({
  id: "alert-1",
  userId: "user-1",
  origin: "SFO",
  destination: "HNL",
  dateMode: "single_date",
  date: "2026-07-01",
  startDate: undefined,
  endDate: undefined,
  cabin: "business",
  nonstopOnly: true,
  maxMiles: 90000,
  maxCash: 10,
  active: true,
  pollIntervalMinutes: 60,
  minNotificationIntervalMinutes: 180,
  lastCheckedAt: undefined,
  nextCheckAt: undefined,
  createdAt: "2026-04-18T00:00:00.000Z",
  updatedAt: "2026-04-18T00:00:00.000Z",
  ...overrides,
})

describe("claimDueAlerts", () => {
  beforeEach(() => {
    fakeFirestore.reset()
  })

  it("claims active due alerts by nextCheckAt order and limit", async () => {
    await fakeFirestore.collection("alaska_alerts").doc("due-1").set(buildAlert({
      id: "due-1",
      nextCheckAt: "2026-04-18T05:00:00.000Z",
    }) as unknown as StoredDoc)
    await fakeFirestore.collection("alaska_alerts").doc("due-2").set(buildAlert({
      id: "due-2",
      nextCheckAt: "2026-04-18T05:30:00.000Z",
    }) as unknown as StoredDoc)
    await fakeFirestore.collection("alaska_alerts").doc("future").set(buildAlert({
      id: "future",
      nextCheckAt: "2026-04-18T07:00:00.000Z",
    }) as unknown as StoredDoc)
    await fakeFirestore.collection("alaska_alerts").doc("inactive").set(buildAlert({
      id: "inactive",
      active: false,
      nextCheckAt: "2026-04-18T04:00:00.000Z",
    }) as unknown as StoredDoc)

    const dueAlerts = await claimDueAlerts(new Date("2026-04-18T06:00:00.000Z"), {
      limit: 1,
      migrationFallbackLimit: 0,
      claimTtlMinutes: 5,
    })

    expect(dueAlerts.map((alert) => alert.id)).toEqual(["due-1"])

    const claimed = await fakeFirestore.collection("alaska_alerts").doc("due-1").get()
    expect(claimed.data()).toEqual(expect.objectContaining({
      nextCheckAt: "2026-04-18T06:05:00.000Z",
    }))
  })

  it("does not return an already-claimed due alert on a second pass", async () => {
    await fakeFirestore.collection("alaska_alerts").doc("due-1").set(buildAlert({
      id: "due-1",
      nextCheckAt: "2026-04-18T05:00:00.000Z",
    }) as unknown as StoredDoc)
    await fakeFirestore.collection("alaska_alerts").doc("due-2").set(buildAlert({
      id: "due-2",
      nextCheckAt: "2026-04-18T05:30:00.000Z",
    }) as unknown as StoredDoc)

    const now = new Date("2026-04-18T06:00:00.000Z")

    expect((await claimDueAlerts(now, {
      limit: 1,
      migrationFallbackLimit: 0,
      claimTtlMinutes: 5,
    })).map((alert) => alert.id)).toEqual(["due-1"])

    expect((await claimDueAlerts(now, {
      limit: 2,
      migrationFallbackLimit: 0,
      claimTtlMinutes: 5,
    })).map((alert) => alert.id)).toEqual(["due-2"])
  })

  it("uses a bounded fallback for active alerts missing nextCheckAt", async () => {
    await fakeFirestore.collection("alaska_alerts").doc("fallback-1").set(buildAlert({
      id: "fallback-1",
      lastCheckedAt: "2026-04-18T01:00:00.000Z",
      nextCheckAt: undefined,
      updatedAt: "2026-04-18T01:00:00.000Z",
    }) as unknown as StoredDoc)
    await fakeFirestore.collection("alaska_alerts").doc("fallback-2").set(buildAlert({
      id: "fallback-2",
      lastCheckedAt: undefined,
      nextCheckAt: undefined,
      updatedAt: "2026-04-18T02:00:00.000Z",
    }) as unknown as StoredDoc)
    await fakeFirestore.collection("alaska_alerts").doc("fallback-3").set(buildAlert({
      id: "fallback-3",
      lastCheckedAt: "2026-04-18T05:30:00.000Z",
      nextCheckAt: undefined,
      updatedAt: "2026-04-18T03:00:00.000Z",
    }) as unknown as StoredDoc)

    const dueAlerts = await claimDueAlerts(new Date("2026-04-18T06:00:00.000Z"), {
      limit: 10,
      migrationFallbackLimit: 2,
      claimTtlMinutes: 5,
    })

    expect(dueAlerts.map((alert) => alert.id)).toEqual(["fallback-1", "fallback-2"])

    const claimedLegacy = await fakeFirestore.collection("alaska_alerts").doc("fallback-1").get()
    expect(claimedLegacy.data()).toEqual(expect.objectContaining({
      nextCheckAt: "2026-04-18T06:05:00.000Z",
    }))
  })

  it("pages through legacy fallback until due alerts beyond the first page are found", async () => {
    await fakeFirestore.collection("alaska_alerts").doc("legacy-1").set(buildAlert({
      id: "legacy-1",
      lastCheckedAt: "2026-04-18T05:30:00.000Z",
      nextCheckAt: undefined,
      updatedAt: "2026-04-18T01:00:00.000Z",
    }) as unknown as StoredDoc)
    await fakeFirestore.collection("alaska_alerts").doc("legacy-2").set(buildAlert({
      id: "legacy-2",
      lastCheckedAt: "2026-04-18T05:45:00.000Z",
      nextCheckAt: undefined,
      updatedAt: "2026-04-18T02:00:00.000Z",
    }) as unknown as StoredDoc)
    await fakeFirestore.collection("alaska_alerts").doc("legacy-due").set(buildAlert({
      id: "legacy-due",
      lastCheckedAt: "2026-04-18T03:00:00.000Z",
      nextCheckAt: undefined,
      updatedAt: "2026-04-18T03:00:00.000Z",
    }) as unknown as StoredDoc)
    await fakeFirestore.collection("alaska_alerts").doc("legacy-4").set(buildAlert({
      id: "legacy-4",
      lastCheckedAt: "2026-04-18T05:50:00.000Z",
      nextCheckAt: undefined,
      updatedAt: "2026-04-18T04:00:00.000Z",
    }) as unknown as StoredDoc)

    const dueAlerts = await claimDueAlerts(new Date("2026-04-18T06:00:00.000Z"), {
      limit: 10,
      migrationFallbackLimit: 2,
      claimTtlMinutes: 5,
    })

    expect(dueAlerts.map((alert) => alert.id)).toEqual(["legacy-due"])
  })
})
