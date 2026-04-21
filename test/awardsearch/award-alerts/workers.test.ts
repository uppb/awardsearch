import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { SqliteAwardAlertsRepository } from "../../../awardsearch/backend/award-alerts/sqlite-repository.js"
import { openAwardAlertsDb } from "../../../awardsearch/backend/award-alerts/sqlite.js"
import type { AwardAlert, AwardSearchQuery, NotificationEvent } from "../../../awardsearch/backend/award-alerts/types.js"
import { runEvaluatorWorker, runNotifierWorker } from "../../../awardsearch/backend/award-alerts/runtime-workers.js"
import { createAwardAlertsServiceShutdownController, startAwardAlertsService } from "../../../awardsearch/workers/award-alerts-service.js"
import type { FlightWithFares } from "../../../awardsearch/types/scrapers.js"

const createDbPath = () => join(mkdtempSync(join(tmpdir(), "award-alert-workers-")), "alerts.sqlite")

const createDeferred = <T>() => {
  let resolveFn!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    resolveFn = resolve
  })

  return { promise, resolve: resolveFn }
}

const readJson = async (response: Response): Promise<unknown> =>
  await response.json() as unknown

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
            search: async () => {
              await Promise.resolve()
              return [matchingFlight]
            },
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

      const state = repository.getState("alert-1")
      const runCount = db.prepare("SELECT COUNT(*) AS count FROM award_alert_runs WHERE alert_id = ?").get("alert-1") as { count: number }
      const notificationEvent = db.prepare("SELECT status, payload FROM notification_events WHERE alert_id = ?").get("alert-1") as {
        status: string
        payload: string
      }

      expect(state).toMatchObject({
        hasMatch: true,
        matchedDates: ["2026-07-01"],
        lastNotifiedAt: "2026-04-19T00:00:00.000Z",
      })
      expect(runCount).toEqual({ count: 1 })
      expect(notificationEvent.status).toBe("pending")
      expect(notificationEvent.payload).toContain("\"bookingUrl\":\"https://example.test/booking\"")
    } finally {
      db.close()
    }
  })

  it("runEvaluatorWorker supports alerts and notification events without a userId", async () => {
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
      repository.insertAlert(buildAlert({ userId: undefined }))

      await runEvaluatorWorker({
        databasePath: dbPath,
        now: new Date("2026-04-19T00:00:00.000Z"),
        providers: {
          alaska: {
            search: async () => {
              await Promise.resolve()
              return [matchingFlight]
            },
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
              matchFingerprint: "fp-null-user",
              bookingUrl: "https://example.test/booking",
            }),
          },
        },
      })

      const state = repository.getState("alert-1")
      expect(state).toMatchObject({
        hasMatch: true,
        lastNotifiedAt: "2026-04-19T00:00:00.000Z",
      })
      expect(db.prepare("SELECT user_id, status FROM notification_events WHERE alert_id = ?").get("alert-1")).toEqual({
        user_id: null,
        status: "pending",
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
    type NotificationRepositoryMock = {
      claimPendingNotificationEvents: (limit: number, claimedAt: string, staleBefore: string) => NotificationEvent[]
      markNotificationAttempting: (id: string, attemptedAt: string, claimToken: string | undefined) => void
      markNotificationSent: (id: string, sentAt: string, claimToken?: string) => void
      markNotificationDeliveredUnconfirmed: (id: string, reason: string, claimToken?: string) => void
      markNotificationFailed: (id: string, reason: string, claimToken?: string) => void
    }
    const repository: NotificationRepositoryMock = {
      claimPendingNotificationEvents: vi.fn<[number, string, string], NotificationEvent[]>().mockReturnValue([event]),
      markNotificationAttempting: vi.fn<Parameters<SqliteAwardAlertsRepository["markNotificationAttempting"]>, ReturnType<SqliteAwardAlertsRepository["markNotificationAttempting"]>>().mockReturnValue(undefined),
      markNotificationSent: vi.fn<Parameters<SqliteAwardAlertsRepository["markNotificationSent"]>, ReturnType<SqliteAwardAlertsRepository["markNotificationSent"]>>().mockReturnValue(undefined),
      markNotificationDeliveredUnconfirmed: vi.fn<Parameters<SqliteAwardAlertsRepository["markNotificationDeliveredUnconfirmed"]>, ReturnType<SqliteAwardAlertsRepository["markNotificationDeliveredUnconfirmed"]>>().mockReturnValue(undefined),
      markNotificationFailed: vi.fn<Parameters<SqliteAwardAlertsRepository["markNotificationFailed"]>, ReturnType<SqliteAwardAlertsRepository["markNotificationFailed"]>>().mockReturnValue(undefined),
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

  it("runNotifierWorker opens the SQLite database path and marks pending events as sent", async () => {
    const dbPath = createDbPath()
    const db = openAwardAlertsDb(dbPath)
    const repository = new SqliteAwardAlertsRepository(db)
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    })

    try {
      repository.insertAlert(buildAlert())
      repository.createNotificationEvent(buildPendingNotificationEvent())
    } finally {
      db.close()
    }

    await runNotifierWorker({
      databasePath: dbPath,
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
      now: new Date("2026-04-19T00:10:00.000Z"),
    })

    const checkDb = openAwardAlertsDb(dbPath)
    try {
      expect(fetchFn).toHaveBeenCalledOnce()
      const firstCall = fetchFn.mock.calls[0] as [string, RequestInit] | undefined
      expect(firstCall?.[0]).toBe("https://discord.test/webhook")
      expect(firstCall?.[1]).toMatchObject({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      })
      const notificationEvent = checkDb.prepare("SELECT status, sent_at, claimed_at, claim_token, attempted_at, failure_reason FROM notification_events WHERE id = ?").get("event-1") as {
        status: string
        sent_at: string | null
        claimed_at: string | null
        claim_token: string | null
        attempted_at: string | null
        failure_reason: string | null
      }
      expect(notificationEvent).toEqual({
        status: "sent",
        sent_at: "2026-04-19T00:10:00.000Z",
        claimed_at: null,
        claim_token: null,
        attempted_at: null,
        failure_reason: null,
      })
    } finally {
      checkDb.close()
    }
  })

  it("runEvaluatorWorker uses the shared default provider builder when providers are omitted", async () => {
    const dbPath = createDbPath()
    const db = openAwardAlertsDb(dbPath)
    const repository = new SqliteAwardAlertsRepository(db)
    const search = vi.fn<[AwardSearchQuery], Promise<FlightWithFares[]>>(async (_query: AwardSearchQuery) => {
      await Promise.resolve()
      return []
    })
    const evaluateMatches = vi.fn(() => ({
      hasMatch: false,
      matchedDates: [],
      matchingResults: [],
      bestMatchSummary: undefined,
      matchFingerprint: "preview-fingerprint",
      bookingUrl: "https://example.test/booking",
    }))

    try {
      repository.insertAlert(buildAlert({ userId: undefined }))

      vi.resetModules()
      vi.doMock("../../../awardsearch/backend/award-alerts/providers/index.js", () => ({
        buildDefaultAwardAlertProviders: () => ({
          alaska: {
            search,
            evaluateMatches,
          },
        }),
      }))

      const { runEvaluatorWorker } = await import("../../../awardsearch/backend/award-alerts/runtime-workers.js")

      await runEvaluatorWorker({
        databasePath: dbPath,
        now: new Date("2026-04-19T00:00:00.000Z"),
      })

      expect(search).toHaveBeenCalledWith({
        origin: "SFO",
        destination: "HNL",
        departureDate: "2026-07-01",
      })
      expect(evaluateMatches).toHaveBeenCalledOnce()
    } finally {
      db.close()
      vi.unmock("../../../awardsearch/backend/award-alerts/providers/index.js")
    }
  })

  it("starts the unified award alerts service and rejects overlapping manual evaluator triggers", async () => {
    const dbPath = createDbPath()
    const db = openAwardAlertsDb(dbPath)
    const repository = new SqliteAwardAlertsRepository(db)
    const deferred = createDeferred<undefined>()
    const search = vi.fn<[AwardSearchQuery], Promise<FlightWithFares[]>>(async (_query: AwardSearchQuery) => {
      await deferred.promise
      return []
    })
    const evaluateMatches = vi.fn(() => ({
      hasMatch: false,
      matchedDates: [],
      matchingResults: [],
      bestMatchSummary: undefined,
      matchFingerprint: "service-fingerprint",
      bookingUrl: "https://example.test/booking",
    }))

    try {
      repository.insertAlert(buildAlert({
        nextCheckAt: "2026-04-19T23:59:00.000Z",
      }))
    } finally {
      db.close()
    }

    const service = await startAwardAlertsService({
      databasePath: dbPath,
      port: 0,
      evaluatorIntervalMs: 60 * 60 * 1000,
      notifierIntervalMs: 60 * 60 * 1000,
      webhookUrl: "https://discord.test/webhook",
      providers: {
        alaska: {
          search,
          evaluateMatches,
        },
      },
    })

    let closed = false
    const closeService = async () => {
      if (closed)
        return
      closed = true
      await service.close()
    }

    try {
      const statusResponse = await fetch(`${service.baseUrl}/api/award-alerts/status`)
      expect(statusResponse.status).toBe(200)
      const statusBody = await readJson(statusResponse) as {
        databasePath: string
        evaluator: { running: boolean, intervalMs: number }
        notifier: { running: boolean, intervalMs: number }
      }
      expect(statusBody.databasePath).toBe(dbPath)
      expect(statusBody.evaluator).toMatchObject({
        running: false,
        intervalMs: 60 * 60 * 1000,
      })
      expect(statusBody.notifier).toMatchObject({
        running: false,
        intervalMs: 60 * 60 * 1000,
      })

      const firstRunResponse = await fetch(`${service.baseUrl}/api/award-alerts/operations/run-evaluator`, {
        method: "POST",
      })
      expect(firstRunResponse.status).toBe(200)
      expect(await readJson(firstRunResponse)).toEqual({ started: true })

      const runningStatusResponse = await fetch(`${service.baseUrl}/api/award-alerts/status`)
      const runningStatusBody = await readJson(runningStatusResponse) as {
        evaluator: { running: boolean, lastStartedAt: string }
      }
      expect(runningStatusBody.evaluator.running).toBe(true)
      expect(runningStatusBody.evaluator.lastStartedAt).toEqual(expect.any(String))

      const secondRunResponse = await fetch(`${service.baseUrl}/api/award-alerts/operations/run-evaluator`, {
        method: "POST",
      })
      expect(secondRunResponse.status).toBe(200)
      expect(await readJson(secondRunResponse)).toEqual({ started: false, reason: "already_running" })

      deferred.resolve(undefined)
      await closeService()
    } finally {
      deferred.resolve(undefined)
      await closeService().catch(() => undefined)
    }
  })

  it("runs the notifier loop automatically in the unified service runtime", async () => {
    vi.useFakeTimers()

    const dbPath = createDbPath()
    const db = openAwardAlertsDb(dbPath)
    const repository = new SqliteAwardAlertsRepository(db)
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    })

    try {
      repository.insertAlert(buildAlert())
      repository.createNotificationEvent(buildPendingNotificationEvent())
    } finally {
      db.close()
    }

    const service = await startAwardAlertsService({
      databasePath: dbPath,
      port: 0,
      evaluatorIntervalMs: 60 * 60 * 1000,
      notifierIntervalMs: 100,
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    })

    try {
      expect(fetchFn).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(100)
      await vi.advanceTimersByTimeAsync(0)

      expect(fetchFn).toHaveBeenCalledOnce()
      const firstCall = fetchFn.mock.calls[0] as [string, RequestInit] | undefined
      expect(firstCall?.[0]).toBe("https://discord.test/webhook")
      expect(firstCall?.[1]).toMatchObject({
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      })

      const statusResponse = await fetch(`${service.baseUrl}/api/award-alerts/status`)
      const statusBody = await readJson(statusResponse) as {
        notifier: { lastStartedAt: string, lastCompletedAt: string }
      }
      expect(statusBody.notifier.lastStartedAt).toEqual(expect.any(String))
      expect(statusBody.notifier.lastCompletedAt).toEqual(expect.any(String))
    } finally {
      await service.close()
      vi.useRealTimers()
    }
  })

  it("awaits shutdown after SIGTERM or SIGINT is received", async () => {
    const service = {
      close: vi.fn().mockResolvedValue(undefined),
    }
    const onceHandlers = new Map<string, () => void>()
    const removeListener = vi.fn()
    const shutdown = createAwardAlertsServiceShutdownController(service, {
      once: (signal, handler) => {
        onceHandlers.set(signal, handler)
      },
      removeListener,
    })

    onceHandlers.get("SIGTERM")?.()
    await shutdown.waitForShutdown

    expect(service.close).toHaveBeenCalledOnce()
    expect(removeListener).toHaveBeenCalledWith("SIGTERM", expect.any(Function))
    expect(removeListener).toHaveBeenCalledWith("SIGINT", expect.any(Function))
  })
})
