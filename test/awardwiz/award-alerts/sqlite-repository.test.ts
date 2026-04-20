import { describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openAwardAlertsDb } from "../../../awardwiz/backend/award-alerts/sqlite.js"
import { SqliteAwardAlertsRepository } from "../../../awardwiz/backend/award-alerts/sqlite-repository.js"
import type { AwardAlert, AwardAlertRun, AwardAlertState, NotificationEvent } from "../../../awardwiz/backend/award-alerts/types.js"

// @ts-expect-error attempting is an internal in-flight marker, not a public notification status
const invalidNotificationStatus: NotificationEvent["status"] = "attempting"
void invalidNotificationStatus

const openRepository = () => {
  const db = openAwardAlertsDb(join(mkdtempSync(join(tmpdir(), "award-alerts-repo-")), "alerts.sqlite"))
  return {
    db,
    repo: new SqliteAwardAlertsRepository(db),
  }
}

const buildAlert = (overrides: Partial<AwardAlert> = {}): AwardAlert => ({
  ...({
    id: "alert-1",
    program: "alaska",
    userId: "user-1",
    origin: "SFO",
    destination: "HNL",
    dateMode: "single_date",
    date: "2026-07-01",
    cabin: "economy",
    nonstopOnly: true,
    maxMiles: undefined,
    maxCash: undefined,
    active: true,
    pollIntervalMinutes: 15,
    minNotificationIntervalMinutes: 60,
    lastCheckedAt: undefined,
    nextCheckAt: "2026-04-19T00:00:00.000Z",
    createdAt: "2026-04-19T00:00:00.000Z",
    updatedAt: "2026-04-19T00:00:00.000Z",
  } satisfies AwardAlert),
  ...overrides,
}) as AwardAlert

const buildState = (overrides: Partial<AwardAlertState> = {}): AwardAlertState => ({
  alertId: "alert-1",
  hasMatch: true,
  matchedDates: ["2026-07-01"],
  matchingResults: [{
    date: "2026-07-01",
    flightNo: "AS 843",
    origin: "SFO",
    destination: "HNL",
    departureDateTime: "2026-07-01T19:42:00.000Z",
    arrivalDateTime: "2026-07-01T22:11:00.000Z",
    cabin: "economy" as const,
    miles: 15000,
    cash: 5.6,
    currencyOfCash: "USD",
    bookingClass: "X",
    segmentCount: 1,
  }],
  bestMatchSummary: {
    date: "2026-07-01",
    flightNo: "AS 843",
    origin: "SFO",
    destination: "HNL",
    departureDateTime: "2026-07-01T19:42:00.000Z",
    arrivalDateTime: "2026-07-01T22:11:00.000Z",
    cabin: "economy" as const,
    miles: 15000,
    cash: 5.6,
    currencyOfCash: "USD",
    bookingClass: "X",
    segmentCount: 1,
  },
  matchFingerprint: "fp-1",
  lastMatchAt: "2026-04-19T00:05:00.000Z",
  lastNotifiedAt: undefined,
  lastErrorAt: undefined,
  lastErrorMessage: undefined,
  updatedAt: "2026-04-19T00:05:00.000Z",
  ...overrides,
})

const buildRun = (overrides: Partial<AwardAlertRun> = {}): AwardAlertRun => ({
  id: "run-1",
  alertId: "alert-1",
  startedAt: "2026-04-19T00:05:00.000Z",
  completedAt: "2026-04-19T00:05:05.000Z",
  searchedDates: ["2026-07-01"],
  scrapeCount: 1,
  scrapeSuccessCount: 1,
  scrapeErrorCount: 0,
  matchedResultCount: 1,
  hasMatch: true,
  errorSummary: undefined,
  ...overrides,
})

const buildEvent = (overrides: Partial<NotificationEvent> = {}): NotificationEvent => ({
  id: "event-1",
  alertId: "alert-1",
  userId: "user-1",
  createdAt: "2026-04-19T00:00:00.000Z",
  status: "pending" as const,
  claimedAt: undefined,
  claimToken: undefined,
  attemptedAt: undefined,
  payload: {
    origin: "SFO",
    destination: "HNL",
    cabin: "economy" as const,
    matchedDates: ["2026-07-01"],
    matchCount: 1,
    nonstopOnly: true,
    maxMiles: 15000,
    maxCash: 5.6,
    bestMatch: {
      date: "2026-07-01",
      flightNo: "AS 843",
      origin: "SFO",
      destination: "HNL",
      departureDateTime: "2026-07-01T19:42:00.000Z",
      arrivalDateTime: "2026-07-01T22:11:00.000Z",
      cabin: "economy" as const,
      miles: 15000,
      cash: 5.6,
      currencyOfCash: "USD",
      bookingClass: "X",
      segmentCount: 1,
    },
    bookingUrl: "https://example.test/booking",
  },
  sentAt: undefined,
  failureReason: undefined,
  ...overrides,
})

describe("SqliteAwardAlertsRepository", () => {
  it("saves alert state, run history, and updates next_check_at", async () => {
    const { db, repo } = openRepository()

    try {
      await repo.insertAlert(buildAlert())

      const claimed = repo.claimDueAlerts("2026-04-19T00:00:00.000Z", 10, 5)
      expect(claimed).toHaveLength(1)
      expect(claimed[0]).toMatchObject({
        id: "alert-1",
        nextCheckAt: "2026-04-19T00:05:00.000Z",
        updatedAt: "2026-04-19T00:00:00.000Z",
      })

      const state = buildState()
      const run = buildRun()
      repo.saveEvaluation({
        alert: buildAlert(),
        state,
        run,
      })

      expect(repo.getState("alert-1")).toEqual(state)
      expect(db.prepare("SELECT id, alert_id, searched_dates, has_match FROM award_alert_runs").all()).toEqual([{
        id: "run-1",
        alert_id: "alert-1",
        searched_dates: "[\"2026-07-01\"]",
        has_match: 1,
      }])
      expect(db.prepare("SELECT last_checked_at, next_check_at, updated_at FROM award_alerts WHERE id = ?").get("alert-1")).toEqual({
        last_checked_at: "2026-04-19T00:05:00.000Z",
        next_check_at: "2026-04-19T00:20:00.000Z",
        updated_at: "2026-04-19T00:05:00.000Z",
      })
    } finally {
      db.close()
    }
  })

  it("rejects duplicate run ids without mutating prior run history or alert state", async () => {
    const { db, repo } = openRepository()

    try {
      await repo.insertAlert(buildAlert())

      repo.saveEvaluation({
        alert: buildAlert(),
        state: buildState({
          updatedAt: "2026-04-19T00:05:00.000Z",
          matchFingerprint: "fp-1",
        }),
        run: buildRun({
          id: "run-duplicate",
          completedAt: "2026-04-19T00:05:05.000Z",
          matchedResultCount: 1,
        }),
      })

      expect(() => repo.saveEvaluation({
        alert: buildAlert(),
        state: buildState({
          updatedAt: "2026-04-19T00:10:00.000Z",
          matchFingerprint: "fp-2",
          hasMatch: false,
          matchedDates: [],
          matchingResults: [],
          bestMatchSummary: undefined,
          lastMatchAt: undefined,
        }),
        run: buildRun({
          id: "run-duplicate",
          completedAt: "2026-04-19T00:10:05.000Z",
          matchedResultCount: 0,
          hasMatch: false,
        }),
      })).toThrow(/unique|constraint/i)

      expect(repo.getState("alert-1")).toEqual(buildState({
        updatedAt: "2026-04-19T00:05:00.000Z",
        matchFingerprint: "fp-1",
      }))
      expect(db.prepare("SELECT id, completed_at, matched_result_count, has_match FROM award_alert_runs WHERE id = ?").get("run-duplicate")).toEqual({
        id: "run-duplicate",
        completed_at: "2026-04-19T00:05:05.000Z",
        matched_result_count: 1,
        has_match: 1,
      })
      expect(db.prepare("SELECT last_checked_at, next_check_at, updated_at FROM award_alerts WHERE id = ?").get("alert-1")).toEqual({
        last_checked_at: "2026-04-19T00:05:00.000Z",
        next_check_at: "2026-04-19T00:20:00.000Z",
        updated_at: "2026-04-19T00:05:00.000Z",
      })
    } finally {
      db.close()
    }
  })

  it("does not overwrite an existing notification event on retry", async () => {
    const { db, repo } = openRepository()

    try {
      await repo.insertAlert(buildAlert())
      repo.createNotificationEvent(buildEvent({
        id: "event-1",
        status: "sent",
        sentAt: "2026-04-19T00:02:00.000Z",
      }))

      repo.createNotificationEvent(buildEvent({
        id: "event-1",
        status: "pending",
        sentAt: undefined,
      }))

      expect(db.prepare("SELECT status, sent_at FROM notification_events WHERE id = ?").get("event-1")).toEqual({
        status: "sent",
        sent_at: "2026-04-19T00:02:00.000Z",
      })
    } finally {
      db.close()
    }
  })

  it("does not ignore unrelated notification event constraint failures", async () => {
    const { db, repo } = openRepository()

    try {
      await repo.insertAlert(buildAlert())

      expect(() => repo.createNotificationEvent({
        ...buildEvent(),
        id: "event-invalid-status",
        status: "invalid-status" as never,
      })).toThrow("CHECK constraint failed")

      expect(db.prepare("SELECT COUNT(*) AS count FROM notification_events").get()).toEqual({ count: 0 })
    } finally {
      db.close()
    }
  })

  it("finalizes stale attempted processing events instead of reclaiming them", async () => {
    const { db, repo } = openRepository()

    try {
      await repo.insertAlert(buildAlert())
      repo.createNotificationEvent(buildEvent({
        id: "attempting-1",
        status: "processing",
        claimedAt: "2026-04-19T00:30:00.000Z",
        claimToken: "claim-old",
        attemptedAt: "2026-04-19T00:31:00.000Z",
      }))
      repo.createNotificationEvent(buildEvent({
        id: "pending-1",
        status: "pending",
      }))

      const claimed = repo.claimPendingNotificationEvents(5, "2026-04-19T01:00:00.000Z", "2026-04-19T00:45:00.000Z")

      expect(claimed.map((event) => event.id)).toEqual(["pending-1"])
      expect({
        ...(db.prepare("SELECT status, claimed_at, claim_token, attempted_at, failure_reason FROM notification_events WHERE id = ?").get("attempting-1") as Record<string, unknown>),
      }).toEqual({
        status: "delivered_unconfirmed",
        claimed_at: null,
        claim_token: null,
        attempted_at: null,
        failure_reason: "At-most-once: stale attempting event was finalized without retry after worker interruption (claimed before 2026-04-19T00:45:00.000Z).",
      })
    } finally {
      db.close()
    }
  })

  it("reclaims stale processing events before fresh pending events", async () => {
    const { db, repo } = openRepository()

    try {
      await repo.insertAlert(buildAlert())
      repo.createNotificationEvent(buildEvent({
        id: "stale-processing-1",
        status: "processing",
        claimedAt: "2026-04-19T00:30:00.000Z",
        claimToken: "claim-old",
      }))
      repo.createNotificationEvent(buildEvent({
        id: "pending-1",
        status: "pending",
        createdAt: "2026-04-19T00:40:00.000Z",
      }))
      repo.createNotificationEvent(buildEvent({
        id: "pending-2",
        status: "pending",
        createdAt: "2026-04-19T00:41:00.000Z",
      }))

      const claimed = repo.claimPendingNotificationEvents(2, "2026-04-19T01:00:00.000Z", "2026-04-19T00:45:00.000Z")
      expect(claimed.map((event) => event.id)).toEqual(["stale-processing-1", "pending-1"])
      expect(claimed.every((event) => event.status === "processing")).toBe(true)
      expect(claimed.every((event) => event.claimedAt === "2026-04-19T01:00:00.000Z")).toBe(true)
      expect(new Set(claimed.map((event) => event.claimToken)).size).toBe(2)
    } finally {
      db.close()
    }
  })

  it("uses immediate transactions for claim and notification transition paths", async () => {
    let immediateCalls = 0
    let deferredCalls = 0
    const createFakeDb = (current?: {
      status: NotificationEvent["status"]
      claim_token: string | null
      attempted_at: string | null
    }) => ({
      transaction<T extends (...args: any[]) => unknown>(fn: T) {
        const wrapped = (...args: Parameters<T>) => {
          deferredCalls += 1
          return fn(...args)
        }
        wrapped.default = (...args: Parameters<T>) => {
          deferredCalls += 1
          return fn(...args)
        }
        wrapped.immediate = (...args: Parameters<T>) => {
          immediateCalls += 1
          return fn(...args)
        }
        wrapped.deferred = (...args: Parameters<T>) => fn(...args)
        wrapped.exclusive = (...args: Parameters<T>) => fn(...args)
        return wrapped
      },
      prepare(sql: string) {
        return {
          all: () => [],
          get: () => sql.includes("SELECT status, claim_token, attempted_at FROM notification_events") ? current : undefined,
          run: () => ({ changes: 1 }),
        }
      },
    })

    new SqliteAwardAlertsRepository(createFakeDb() as any).claimDueAlerts("2026-04-19T00:00:00.000Z", 10, 5)
    new SqliteAwardAlertsRepository(createFakeDb() as any).claimPendingNotificationEvents(1, "2026-04-19T01:00:00.000Z", "2026-04-19T00:45:00.000Z")
    new SqliteAwardAlertsRepository(createFakeDb({
      status: "processing",
      claim_token: "claim-1",
      attempted_at: null,
    }) as any).markNotificationAttempting("event-1", "2026-04-19T01:01:00.000Z", "claim-1")
    new SqliteAwardAlertsRepository(createFakeDb({
      status: "processing",
      claim_token: "claim-1",
      attempted_at: "2026-04-19T01:01:00.000Z",
    }) as any).markNotificationDeliveredUnconfirmed("event-1", "At-most-once: ambiguous delivery")
    new SqliteAwardAlertsRepository(createFakeDb({
      status: "processing",
      claim_token: "claim-1",
      attempted_at: "2026-04-19T01:01:00.000Z",
    }) as any).markNotificationSent("event-1", "2026-04-19T01:02:00.000Z")
    new SqliteAwardAlertsRepository(createFakeDb({
      status: "processing",
      claim_token: "claim-1",
      attempted_at: "2026-04-19T01:01:00.000Z",
    }) as any).markNotificationFailed("event-1", "Discord webhook request failed with status 400")

    expect(immediateCalls).toBe(6)
    expect(deferredCalls).toBe(0)
  })

  it("guards notification attempt transitions with the claim token and records terminal states", async () => {
    const { db, repo } = openRepository()

    try {
      await repo.insertAlert(buildAlert())
      repo.createNotificationEvent(buildEvent({
        id: "event-processing",
        status: "processing",
        claimedAt: "2026-04-19T01:00:00.000Z",
        claimToken: "claim-1",
      }))

      expect(() => repo.markNotificationAttempting("event-processing", "2026-04-19T01:01:00.000Z", "wrong-token")).toThrow("stale claim token")

      repo.markNotificationAttempting("event-processing", "2026-04-19T01:01:00.000Z", "claim-1")
      expect({
        ...(db.prepare("SELECT status, claim_token, attempted_at FROM notification_events WHERE id = ?").get("event-processing") as Record<string, unknown>),
      }).toEqual({
        status: "processing",
        claim_token: "claim-1",
        attempted_at: "2026-04-19T01:01:00.000Z",
      })

      repo.markNotificationDeliveredUnconfirmed("event-processing", "At-most-once: ambiguous delivery")
      expect(db.prepare("SELECT status, claimed_at, claim_token, attempted_at, failure_reason FROM notification_events WHERE id = ?").get("event-processing")).toEqual({
        status: "delivered_unconfirmed",
        claimed_at: null,
        claim_token: null,
        attempted_at: null,
        failure_reason: "At-most-once: ambiguous delivery",
      })

      repo.createNotificationEvent(buildEvent({
        id: "event-sent",
        status: "processing",
        claimedAt: "2026-04-19T01:00:00.000Z",
        claimToken: "claim-2",
      }))
      repo.markNotificationAttempting("event-sent", "2026-04-19T01:01:30.000Z", "claim-2")
      repo.markNotificationSent("event-sent", "2026-04-19T01:02:00.000Z")
      expect(db.prepare("SELECT status, sent_at, claimed_at, claim_token, attempted_at, failure_reason FROM notification_events WHERE id = ?").get("event-sent")).toEqual({
        status: "sent",
        sent_at: "2026-04-19T01:02:00.000Z",
        claimed_at: null,
        claim_token: null,
        attempted_at: null,
        failure_reason: null,
      })

      repo.createNotificationEvent(buildEvent({
        id: "event-failed",
        status: "processing",
        claimedAt: "2026-04-19T01:00:00.000Z",
        claimToken: "claim-3",
      }))
      repo.markNotificationAttempting("event-failed", "2026-04-19T01:01:30.000Z", "claim-3")
      repo.markNotificationFailed("event-failed", "Discord webhook request failed with status 400")
      expect(db.prepare("SELECT status, claimed_at, claim_token, attempted_at, failure_reason FROM notification_events WHERE id = ?").get("event-failed")).toEqual({
        status: "failed",
        claimed_at: null,
        claim_token: null,
        attempted_at: null,
        failure_reason: "Discord webhook request failed with status 400",
      })
    } finally {
      db.close()
    }
  })

  it("does not let a stale worker overwrite a finalized stale attempt as sent", async () => {
    const { db, repo } = openRepository()

    try {
      await repo.insertAlert(buildAlert())
      repo.createNotificationEvent(buildEvent({
        id: "event-stale-sent",
        status: "processing",
        claimedAt: "2026-04-19T00:30:00.000Z",
        claimToken: "claim-stale",
      }))

      repo.markNotificationAttempting("event-stale-sent", "2026-04-19T00:31:00.000Z", "claim-stale")
      repo.claimPendingNotificationEvents(1, "2026-04-19T01:00:00.000Z", "2026-04-19T00:45:00.000Z")

      expect(() => repo.markNotificationSent("event-stale-sent", "2026-04-19T01:05:00.000Z")).toThrow("stale claim token")
      expect(db.prepare("SELECT status, sent_at, claimed_at, claim_token, attempted_at, failure_reason FROM notification_events WHERE id = ?").get("event-stale-sent")).toEqual({
        status: "delivered_unconfirmed",
        sent_at: null,
        claimed_at: null,
        claim_token: null,
        attempted_at: null,
        failure_reason: "At-most-once: stale attempting event was finalized without retry after worker interruption (claimed before 2026-04-19T00:45:00.000Z).",
      })
    } finally {
      db.close()
    }
  })

  it("does not let a stale worker overwrite a finalized stale attempt as failed", async () => {
    const { db, repo } = openRepository()

    try {
      await repo.insertAlert(buildAlert())
      repo.createNotificationEvent(buildEvent({
        id: "event-stale-failed",
        status: "processing",
        claimedAt: "2026-04-19T00:30:00.000Z",
        claimToken: "claim-stale",
      }))

      repo.markNotificationAttempting("event-stale-failed", "2026-04-19T00:31:00.000Z", "claim-stale")
      repo.claimPendingNotificationEvents(1, "2026-04-19T01:00:00.000Z", "2026-04-19T00:45:00.000Z")

      expect(() => repo.markNotificationFailed("event-stale-failed", "Discord webhook request failed with status 400")).toThrow("stale claim token")
      expect(db.prepare("SELECT status, sent_at, claimed_at, claim_token, attempted_at, failure_reason FROM notification_events WHERE id = ?").get("event-stale-failed")).toEqual({
        status: "delivered_unconfirmed",
        sent_at: null,
        claimed_at: null,
        claim_token: null,
        attempted_at: null,
        failure_reason: "At-most-once: stale attempting event was finalized without retry after worker interruption (claimed before 2026-04-19T00:45:00.000Z).",
      })
    } finally {
      db.close()
    }
  })

  it("does not let a stale caller overwrite a finalized stale attempt as delivered_unconfirmed", async () => {
    const { db, repo } = openRepository()

    try {
      await repo.insertAlert(buildAlert())
      repo.createNotificationEvent(buildEvent({
        id: "event-stale-delivered-unconfirmed",
        status: "processing",
        claimedAt: "2026-04-19T00:30:00.000Z",
        claimToken: "claim-stale",
      }))

      repo.markNotificationAttempting("event-stale-delivered-unconfirmed", "2026-04-19T00:31:00.000Z", "claim-stale")
      repo.claimPendingNotificationEvents(1, "2026-04-19T01:00:00.000Z", "2026-04-19T00:45:00.000Z")

      expect(() => repo.markNotificationDeliveredUnconfirmed(
        "event-stale-delivered-unconfirmed",
        "At-most-once: later caller should not overwrite finalized stale attempt",
      )).toThrow("stale claim token")
      expect(db.prepare("SELECT status, sent_at, claimed_at, claim_token, attempted_at, failure_reason FROM notification_events WHERE id = ?").get("event-stale-delivered-unconfirmed")).toEqual({
        status: "delivered_unconfirmed",
        sent_at: null,
        claimed_at: null,
        claim_token: null,
        attempted_at: null,
        failure_reason: "At-most-once: stale attempting event was finalized without retry after worker interruption (claimed before 2026-04-19T00:45:00.000Z).",
      })
    } finally {
      db.close()
    }
  })
})
