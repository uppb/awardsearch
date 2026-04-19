import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AlaskaAlert, AlaskaAlertRun, AlaskaAlertState, NotificationEvent } from "../../../awardwiz/backend/alaska-alerts/types.js"

const DELETE_FIELD = Symbol("firestore-delete")

type StoredDoc = Record<string, unknown>

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

class FakeDocSnapshot {
  constructor(private readonly id: string, private readonly value: StoredDoc | undefined, readonly ref: FakeDocRef) {}

  get exists() {
    return this.value !== undefined
  }

  data() {
    return this.value === undefined ? undefined : clone(this.value)
  }
}

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

    const next = clone(current)
    for (const [key, fieldValue] of Object.entries(value)) {
      if (fieldValue === DELETE_FIELD)
        delete next[key]
      else
        next[key] = clone(fieldValue)
    }
    this.store.set(this.id, next)
  }
}

class FakeQuerySnapshot {
  constructor(readonly docs: FakeDocSnapshot[]) {}
}

class FakeQuery {
  constructor(
    protected readonly store: Map<string, StoredDoc>,
    private readonly filters: Array<{ field: string, operator: "==" | "<=", value: unknown }> = [],
    private readonly maxResults = Number.POSITIVE_INFINITY,
  ) {}

  where(field: string, operator: "==" | "<=", value: unknown) {
    return new FakeQuery(this.store, [...this.filters, { field, operator, value }], this.maxResults)
  }

  limit(maxResults: number) {
    return new FakeQuery(this.store, this.filters, maxResults)
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

  batch() {
    const writes: Array<() => Promise<void>> = []
    return {
      set: (docRef: FakeDocRef, value: StoredDoc) => {
        writes.push(() => docRef.set(value))
      },
      update: (docRef: FakeDocRef, value: StoredDoc) => {
        writes.push(() => docRef.update(value))
      },
      commit: async () => {
        for (const write of writes)
          await write()
      },
    }
  }

  async runTransaction<T>(callback: (transaction: {
    get: (target: FakeDocRef | FakeQuery) => Promise<FakeDocSnapshot | FakeQuerySnapshot>
    set: (docRef: FakeDocRef, value: StoredDoc) => void
    update: (docRef: FakeDocRef, value: StoredDoc) => void
  }) => Promise<T>) {
    const writes: Array<() => Promise<void>> = []
    const transaction = {
      get: async (target: FakeDocRef | FakeQuery) => {
        if (target instanceof FakeDocRef)
          return target.get()
        return target.execute()
      },
      set: (docRef: FakeDocRef, value: StoredDoc) => {
        writes.push(() => docRef.set(value))
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

const fakeFirestore = new FakeFirestore()

vi.mock("firebase-admin", () => ({
  default: {
    firestore: Object.assign(() => fakeFirestore, {
      FieldValue: {
        delete: () => DELETE_FIELD,
      },
    }),
  },
}))

vi.mock("../../../awardwiz/backend/alaska-alerts/firebase-admin.js", () => ({
  getFirebaseAdminApp: vi.fn(() => ({ name: "test-app" })),
}))

const { FirestoreAlaskaAlertsRepository } = await import("../../../awardwiz/backend/alaska-alerts/firestore-repository.js")

const buildEvent = (overrides: Partial<NotificationEvent> = {}): NotificationEvent => ({
  id: "event-1",
  alertId: "alert-1",
  userId: "user-1",
  createdAt: "2026-04-18T06:00:00.000Z",
  status: "pending",
  claimedAt: undefined,
  claimToken: undefined,
  payload: {
    origin: "SFO",
    destination: "HNL",
    cabin: "business",
    matchedDates: ["2026-07-01"],
    matchCount: 1,
    nonstopOnly: true,
    maxMiles: 90000,
    maxCash: 10,
    bestMatch: undefined,
    bookingUrl: "https://example.test/booking",
  },
  sentAt: undefined,
  failureReason: undefined,
  ...overrides,
})

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
  pollIntervalMinutes: 90,
  minNotificationIntervalMinutes: 180,
  lastCheckedAt: undefined,
  nextCheckAt: undefined,
  createdAt: "2026-04-18T00:00:00.000Z",
  updatedAt: "2026-04-18T00:00:00.000Z",
  ...overrides,
})

describe("FirestoreAlaskaAlertsRepository", () => {
  beforeEach(() => {
    fakeFirestore.reset()
  })

  it.each([
    { status: "sent" as const, sentAt: "2026-04-18T06:05:00.000Z", failureReason: undefined },
    { status: "delivered_unconfirmed" as const, sentAt: undefined, failureReason: "At-most-once: ambiguous delivery" },
  ])("does not overwrite an existing %s notification event on retry", async ({ status, sentAt, failureReason }) => {
    const repository = new FirestoreAlaskaAlertsRepository()
    const existing = buildEvent({
      status,
      sentAt,
      failureReason,
    })

    await fakeFirestore.collection("notification_events").doc(existing.id).set(existing as unknown as StoredDoc)

    await repository.createNotificationEvent(buildEvent({
      id: existing.id,
      status: "pending",
      sentAt: undefined,
      failureReason: undefined,
    }))

    const stored = await fakeFirestore.collection("notification_events").doc(existing.id).get()
    expect(stored.data()).toEqual(existing)
  })

  it("finalizes stale attempting events instead of leaving them nonterminal", async () => {
    const repository = new FirestoreAlaskaAlertsRepository()
    const staleAttempting = buildEvent({
      id: "attempting-1",
      status: "attempting",
      claimedAt: "2026-04-18T05:30:00.000Z",
      claimToken: "claim-old",
      failureReason: undefined,
    })
    const pending = buildEvent({
      id: "pending-1",
      status: "pending",
    })

    await fakeFirestore.collection("notification_events").doc(staleAttempting.id).set(staleAttempting as unknown as StoredDoc)
    await fakeFirestore.collection("notification_events").doc(pending.id).set(pending as unknown as StoredDoc)

    const claimed = await repository.claimPendingNotificationEvents(
      5,
      "2026-04-18T06:00:00.000Z",
      "2026-04-18T05:45:00.000Z",
    )

    expect(claimed.map((event) => event.id)).toEqual(["pending-1"])

    const staleAfterCleanup = await fakeFirestore.collection("notification_events").doc(staleAttempting.id).get()
    expect(staleAfterCleanup.data()).toEqual(expect.objectContaining({
      id: "attempting-1",
      status: "delivered_unconfirmed",
      failureReason: expect.stringContaining("stale attempting"),
    }))
    expect(staleAfterCleanup.data()).not.toHaveProperty("claimedAt")
    expect(staleAfterCleanup.data()).not.toHaveProperty("claimToken")
  })

  it("reclaims stale processing events even when pending events fill the limit", async () => {
    const repository = new FirestoreAlaskaAlertsRepository()
    const staleProcessing = buildEvent({
      id: "processing-1",
      status: "processing",
      claimedAt: "2026-04-18T05:30:00.000Z",
      claimToken: "claim-old",
    })

    await fakeFirestore.collection("notification_events").doc(staleProcessing.id).set(staleProcessing as unknown as StoredDoc)
    await fakeFirestore.collection("notification_events").doc("pending-1").set(buildEvent({
      id: "pending-1",
      status: "pending",
    }) as unknown as StoredDoc)
    await fakeFirestore.collection("notification_events").doc("pending-2").set(buildEvent({
      id: "pending-2",
      status: "pending",
    }) as unknown as StoredDoc)

    const claimed = await repository.claimPendingNotificationEvents(
      2,
      "2026-04-18T06:00:00.000Z",
      "2026-04-18T05:45:00.000Z",
    )

    expect(claimed.map((event) => event.id)).toContain("processing-1")

    const processingAfterClaim = await fakeFirestore.collection("notification_events").doc("processing-1").get()
    expect(processingAfterClaim.data()).toEqual(expect.objectContaining({
      id: "processing-1",
      status: "processing",
      claimedAt: "2026-04-18T06:00:00.000Z",
    }))
    expect(processingAfterClaim.data()).toHaveProperty("claimToken")
    expect(processingAfterClaim.data()).not.toEqual(expect.objectContaining({
      claimToken: "claim-old",
    }))
  })

  it("stores nextCheckAt when persisting an alert evaluation", async () => {
    const repository = new FirestoreAlaskaAlertsRepository()
    const alert = buildAlert({
      id: "alert-next-check",
      pollIntervalMinutes: 90,
    })
    const state: AlaskaAlertState = {
      alertId: alert.id,
      hasMatch: false,
      matchedDates: [],
      matchingResults: [],
      bestMatchSummary: undefined,
      matchFingerprint: "fp-1",
      lastMatchAt: undefined,
      lastNotifiedAt: undefined,
      lastErrorAt: undefined,
      lastErrorMessage: undefined,
      updatedAt: "2026-04-18T06:00:00.000Z",
    }
    const run: AlaskaAlertRun = {
      id: "run-1",
      alertId: alert.id,
      startedAt: "2026-04-18T06:00:00.000Z",
      completedAt: "2026-04-18T06:00:00.000Z",
      searchedDates: ["2026-07-01"],
      scrapeCount: 1,
      scrapeSuccessCount: 1,
      scrapeErrorCount: 0,
      matchedResultCount: 0,
      hasMatch: false,
      errorSummary: undefined,
    }

    await fakeFirestore.collection("alaska_alerts").doc(alert.id).set(alert as unknown as StoredDoc)

    await repository.saveEvaluation({ alert, state, run })

    const storedAlert = await fakeFirestore.collection("alaska_alerts").doc(alert.id).get()
    expect(storedAlert.data()).toEqual(expect.objectContaining({
      lastCheckedAt: "2026-04-18T06:00:00.000Z",
      updatedAt: "2026-04-18T06:00:00.000Z",
      nextCheckAt: "2026-04-18T07:30:00.000Z",
    }))
  })
})
