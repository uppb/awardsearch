import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { SqliteAwardAlertsRepository } from "../../../awardwiz/backend/award-alerts/sqlite-repository.js"
import { openAwardAlertsDb } from "../../../awardwiz/backend/award-alerts/sqlite.js"
import type { AwardAlert, NotificationEvent } from "../../../awardwiz/backend/award-alerts/types.js"
import { runEvaluatorWorker } from "../../../awardwiz/workers/award-alerts-evaluator.js"
import { runNotifierWorker } from "../../../awardwiz/workers/award-alerts-notifier.js"
import type { FlightWithFares } from "../../../awardwiz/types/scrapers.js"

const createDbPath = () => join(mkdtempSync(join(tmpdir(), "award-alert-workers-")), "alerts.sqlite")

const buildAlert = (overrides: Partial<AwardAlert> = {}): AwardAlert => ({
  ...({
    id: "alert-1",
    program: "alaska",
    userId: "user-1",
    origin: "SFO",
    destination: "HNL",
    dateMode: "single_date",
    date: "2026-07-01",
    cabin: "business",
    nonstopOnly: true,
    maxMiles: 90000,
    maxCash: 10,
    active: true,
    pollIntervalMinutes: 30,
    minNotificationIntervalMinutes: 180,
    lastCheckedAt: undefined,
    nextCheckAt: "2026-04-19T00:00:00.000Z",
    createdAt: "2026-04-19T00:00:00.000Z",
    updatedAt: "2026-04-19T00:00:00.000Z",
  } satisfies AwardAlert),
  ...overrides,
}) as AwardAlert

const buildPendingNotificationEvent = (): NotificationEvent => ({
  id: "event-1",
  alertId: "alert-1",
  userId: "user-1",
  createdAt: "2026-04-19T00:01:00.000Z",
  status: "pending",
  claimedAt: undefined,
  claimToken: undefined,
  attemptedAt: undefined,
  payload: {
    origin: "SFO",
    destination: "HNL",
    cabin: "business",
    matchedDates: ["2026-07-01"],
    matchCount: 1,
    nonstopOnly: true,
    maxMiles: 90000,
    maxCash: 10,
    bestMatch: {
      date: "2026-07-01",
      flightNo: "AS 843",
      origin: "SFO",
      destination: "HNL",
      departureDateTime: "2026-07-01 19:42",
      arrivalDateTime: "2026-07-01 22:11",
      cabin: "business",
      miles: 80000,
      cash: 5.6,
      currencyOfCash: "USD",
      bookingClass: "D",
      segmentCount: 1,
    },
    bookingUrl: "https://example.test/booking",
  },
  sentAt: undefined,
  failureReason: undefined,
})

describe("award alert workers", () => {
  it("runEvaluatorWorker opens the SQLite database path and evaluates due alerts", async () => {
    const dbPath = createDbPath()
    const db = openAwardAlertsDb(dbPath)
    const repository = new SqliteAwardAlertsRepository(db)
    const matchingFlight: FlightWithFares = {
      flightNo: "AS 843",
      departureDateTime: "2026-07-01 19:42",
      arrivalDateTime: "2026-07-01 22:11",
      origin: "SFO",
      destination: "HNL",
      duration: 329,
      aircraft: "Airbus A321",
      segmentCount: 1,
      amenities: { hasPods: false, hasWiFi: true },
      fares: [
        { cabin: "business", miles: 80000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
      ],
    }

    try {
      repository.insertAlert(buildAlert())

      await runEvaluatorWorker({
        databasePath: dbPath,
        now: new Date("2026-04-19T00:00:00.000Z"),
        providers: {
          alaska: {
            search: async () => [matchingFlight],
            evaluateMatches: () => ({
              hasMatch: true,
              matchedDates: ["2026-07-01"],
              matchingResults: [{
                date: "2026-07-01",
                flightNo: "AS 843",
                origin: "SFO",
                destination: "HNL",
                departureDateTime: "2026-07-01 19:42",
                arrivalDateTime: "2026-07-01 22:11",
                cabin: "business",
                miles: 80000,
                cash: 5.6,
                currencyOfCash: "USD",
                bookingClass: "D",
                segmentCount: 1,
              }],
              bestMatchSummary: {
                date: "2026-07-01",
                flightNo: "AS 843",
                origin: "SFO",
                destination: "HNL",
                departureDateTime: "2026-07-01 19:42",
                arrivalDateTime: "2026-07-01 22:11",
                cabin: "business",
                miles: 80000,
                cash: 5.6,
                currencyOfCash: "USD",
                bookingClass: "D",
                segmentCount: 1,
              },
              matchFingerprint: "fp-1",
              bookingUrl: "https://example.test/booking",
            }),
          },
        },
      })

      expect(repository.getState("alert-1")).toMatchObject({
        hasMatch: true,
        matchedDates: ["2026-07-01"],
        lastNotifiedAt: "2026-04-19T00:00:00.000Z",
      })
      expect(db.prepare("SELECT COUNT(*) AS count FROM award_alert_runs WHERE alert_id = ?").get("alert-1")).toEqual({ count: 1 })
      expect(db.prepare("SELECT status, payload FROM notification_events WHERE alert_id = ?").get("alert-1")).toEqual({
        status: "pending",
        payload: expect.stringContaining("\"bookingUrl\":\"https://example.test/booking\""),
      })
    } finally {
      db.close()
    }
  })

  it("runNotifierWorker can process claimed notification events through an injected repository", async () => {
    const event = {
      ...buildPendingNotificationEvent(),
      status: "processing" as const,
      claimedAt: "2026-04-19T00:10:00.000Z",
      claimToken: "claim-1",
    }
    const repository = {
      claimPendingNotificationEvents: vi.fn().mockReturnValue([event]),
      markNotificationAttempting: vi.fn().mockResolvedValue(undefined),
      markNotificationSent: vi.fn().mockResolvedValue(undefined),
      markNotificationDeliveredUnconfirmed: vi.fn().mockResolvedValue(undefined),
      markNotificationFailed: vi.fn().mockResolvedValue(undefined),
    }
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    })

    await runNotifierWorker({
      repository,
      webhookUrl: "https://discord.test/webhook",
      now: new Date("2026-04-19T00:10:00.000Z"),
      fetchFn,
    })

    expect(repository.claimPendingNotificationEvents).toHaveBeenCalledWith(
      20,
      "2026-04-19T00:10:00.000Z",
      "2026-04-18T23:55:00.000Z",
    )
    expect(repository.markNotificationAttempting).toHaveBeenCalledWith("event-1", "2026-04-19T00:10:00.000Z", "claim-1")
    expect(repository.markNotificationSent).toHaveBeenCalledWith("event-1", "2026-04-19T00:10:00.000Z", "claim-1")
    expect(fetchFn).toHaveBeenCalledOnce()
  })
})
