import { describe, expect, it, vi } from "vitest"
import { createAwardAlertsService } from "../../../awardsearch/backend/award-alerts/service.js"
import type {
  AwardAlert,
  AwardAlertRun,
  AwardSearchQuery,
  AwardAlertState,
  NotificationEvent,
} from "../../../awardsearch/backend/award-alerts/types.js"

const _createAlert = (overrides: Partial<AwardAlert> = {}): AwardAlert => ({
  id: "alert-1",
  program: "alaska",
  userId: undefined,
  origin: "SHA",
  destination: "HND",
  dateMode: "single_date",
  date: "2026-05-02",
  cabin: "business",
  nonstopOnly: true,
  maxMiles: 35000,
  maxCash: undefined,
  active: true,
  pollIntervalMinutes: 15,
  minNotificationIntervalMinutes: 60,
  lastCheckedAt: undefined,
  nextCheckAt: "2026-04-20T00:00:00.000Z",
  createdAt: "2026-04-20T00:00:00.000Z",
  updatedAt: "2026-04-20T00:00:00.000Z",
  ...overrides,
} as AwardAlert)

const createState = (): AwardAlertState => ({
  alertId: "alert-1",
  hasMatch: true,
  matchedDates: ["2026-05-02"],
  matchingResults: [{
    date: "2026-05-02",
    flightNo: "AS 843",
    origin: "SHA",
    destination: "HND",
    departureDateTime: "2026-05-02 09:10",
    arrivalDateTime: "2026-05-02 11:50",
    cabin: "business",
    miles: 35000,
    cash: 5.6,
    currencyOfCash: "USD",
    bookingClass: "D",
    segmentCount: 1,
  }],
  bestMatchSummary: undefined,
  matchFingerprint: "fp-1",
  lastMatchAt: "2026-04-20T00:00:00.000Z",
  lastNotifiedAt: undefined,
  lastErrorAt: undefined,
  lastErrorMessage: undefined,
  updatedAt: "2026-04-20T00:00:00.000Z",
})

const createRun = (): AwardAlertRun => ({
  id: "run-1",
  alertId: "alert-1",
  startedAt: "2026-04-20T00:00:00.000Z",
  completedAt: "2026-04-20T00:00:01.000Z",
  searchedDates: ["2026-05-02"],
  scrapeCount: 1,
  scrapeSuccessCount: 1,
  scrapeErrorCount: 0,
  matchedResultCount: 1,
  hasMatch: true,
  errorSummary: undefined,
})

const createNotification = (): NotificationEvent => ({
  id: "event-1",
  alertId: "alert-1",
  userId: undefined,
  createdAt: "2026-04-20T00:00:00.000Z",
  status: "pending",
  claimedAt: undefined,
  claimToken: undefined,
  attemptedAt: undefined,
  payload: {
    origin: "SHA",
    destination: "HND",
    cabin: "business",
    matchedDates: ["2026-05-02"],
    matchCount: 1,
    nonstopOnly: true,
    maxMiles: 35000,
    maxCash: undefined,
    bestMatch: undefined,
    bookingUrl: "https://example.test/booking",
  },
  sentAt: undefined,
  failureReason: undefined,
})

const createRepository = () => {
  const alerts = new Map<string, AwardAlert>()
  const runs = new Map<string, AwardAlertRun[]>()
  const notifications = new Map<string, NotificationEvent[]>()

  const repository = {
    listAlerts: vi.fn(() => [...alerts.values()]),
    getAlert: vi.fn((id: string) => alerts.get(id)),
    insertAlert: vi.fn((alert: AwardAlert) => {
      alerts.set(alert.id, structuredClone(alert))
    }),
    updateAlert: vi.fn((alert: AwardAlert) => {
      alerts.set(alert.id, structuredClone(alert))
    }),
    pauseAlert: vi.fn((id: string, updatedAt: string) => {
      const current = alerts.get(id)
      if (!current)
        throw new Error("award alert not found")
      alerts.set(id, {
        ...current,
        active: false,
        nextCheckAt: undefined,
        updatedAt,
      })
    }),
    resumeAlert: vi.fn((id: string, updatedAt: string) => {
      const current = alerts.get(id)
      if (!current)
        throw new Error("award alert not found")
      alerts.set(id, {
        ...current,
        active: true,
        nextCheckAt: updatedAt,
        updatedAt,
      })
    }),
    deleteAlert: vi.fn((id: string) => {
      alerts.delete(id)
    }),
    listAlertRuns: vi.fn((alertId: string) => runs.get(alertId) ?? []),
    listNotificationEvents: vi.fn((alertId: string) => notifications.get(alertId) ?? []),
    getState: vi.fn(() => createState()),
    saveEvaluation: vi.fn(),
    createNotificationEvent: vi.fn(),
  }

  return { repository, alerts, runs, notifications }
}

describe("award alerts service", () => {
  it("creates, updates, pauses, resumes, lists, reads, and deletes alerts", async () => {
    const { repository, alerts } = createRepository()
    const status = { evaluator: { running: false }, notifier: { running: true }, databasePath: "./tmp/award-alerts.sqlite" }
    const service = createAwardAlertsService({
      repository,
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-1",
      runtimeStatus: () => status,
      runEvaluator: vi.fn(),
      runNotifier: vi.fn(),
    })

    const created = await service.createAlert({
      program: "alaska",
      origin: "SHA",
      destination: "HND",
      date: "2026-05-02",
      cabin: "business",
      maxMiles: 35000,
    })

    expect(created).toMatchObject({
      id: "alert-1",
      userId: undefined,
      dateMode: "single_date",
      active: true,
    })
    expect(service.listAlerts()).toEqual([created])
    expect(service.getAlert("alert-1")).toEqual(created)

    const updated = service.updateAlert("alert-1", {
      destination: "NRT",
      userId: null,
      active: false,
    })

    expect(updated).toMatchObject({
      destination: "NRT",
      userId: undefined,
      active: false,
    })

    const paused = service.pauseAlert("alert-1")
    expect(paused).toMatchObject({
      active: false,
      nextCheckAt: undefined,
    })

    const resumed = service.resumeAlert("alert-1")
    expect(resumed).toMatchObject({
      active: true,
      nextCheckAt: "2026-04-20T00:00:00.000Z",
    })

    service.deleteAlert("alert-1")
    expect(service.getAlert("alert-1")).toBeUndefined()
    expect(alerts.size).toBe(0)
  })

  it("rejects unsupported programs before persisting alerts", async () => {
    const { repository } = createRepository()
    const service = createAwardAlertsService({
      repository,
      providers: {},
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-1",
      runtimeStatus: () => ({ evaluator: { running: false }, notifier: { running: false } }),
      runEvaluator: vi.fn(),
      runNotifier: vi.fn(),
    })

    await expect(service.createAlert({
      program: "aeroplan",
      origin: "SHA",
      destination: "HND",
      date: "2026-05-02",
      cabin: "business",
    })).rejects.toThrow("unsupported award program: aeroplan")

    expect(repository.insertAlert).not.toHaveBeenCalled()
  })

  it("returns alert runs and notification history from the repository", () => {
    const { repository, runs, notifications } = createRepository()
    runs.set("alert-1", [createRun()])
    notifications.set("alert-1", [createNotification()])

    const service = createAwardAlertsService({
      repository,
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-1",
      runtimeStatus: () => ({ evaluator: { running: false }, notifier: { running: false } }),
      runEvaluator: vi.fn(),
      runNotifier: vi.fn(),
    })

    expect(service.getAlertRuns("alert-1")).toEqual([createRun()])
    expect(service.getAlertNotifications("alert-1")).toEqual([createNotification()])
  })

  it("runs preview without persisting and uses provider search results", async () => {
    const { repository } = createRepository()
    const search = vi.fn(async () => {
      await Promise.resolve()
      return [{
        flightNo: "AS 843",
        departureDateTime: "2026-05-02 09:10",
        arrivalDateTime: "2026-05-02 11:50",
        origin: "SHA",
        destination: "HND",
        duration: 400,
        aircraft: "A321",
        segmentCount: 1,
        amenities: { hasPods: false, hasWiFi: true },
        fares: [{
          cabin: "business" as const,
          miles: 35000,
          cash: 5.6,
          currencyOfCash: "USD",
          scraper: "alaska" as const,
          bookingClass: "D",
          isSaverFare: false,
        }],
      }]
    })

    const service = createAwardAlertsService({
      repository,
      providers: {
        alaska: {
          search,
          evaluateMatches: () => ({
            hasMatch: true,
            matchedDates: ["2026-05-02"],
            matchingResults: [{
              date: "2026-05-02",
              flightNo: "AS 843",
              origin: "SHA",
              destination: "HND",
              departureDateTime: "2026-05-02 09:10",
              arrivalDateTime: "2026-05-02 11:50",
              cabin: "business",
              miles: 35000,
              cash: 5.6,
              currencyOfCash: "USD",
              bookingClass: "D",
              segmentCount: 1,
            }],
            bestMatchSummary: undefined,
            matchFingerprint: "preview-fp",
            bookingUrl: "https://example.test/booking",
          }),
        },
      },
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-1",
      runtimeStatus: () => ({ evaluator: { running: false }, notifier: { running: false } }),
      runEvaluator: vi.fn(),
      runNotifier: vi.fn(),
    })

    const preview = await service.previewAlert({
      program: "alaska",
      origin: "SHA",
      destination: "HND",
      date: "2026-05-02",
      cabin: "business",
      maxMiles: 35000,
    })

    expect(preview).toMatchObject({
      hasMatch: true,
      matchedDates: ["2026-05-02"],
      bookingUrl: "https://example.test/booking",
    })
    expect(search).toHaveBeenCalledTimes(1)
    expect(repository.insertAlert).not.toHaveBeenCalled()
    expect(repository.updateAlert).not.toHaveBeenCalled()
    expect(repository.deleteAlert).not.toHaveBeenCalled()
  })

  it("rejects preview requests for unsupported programs", async () => {
    const { repository } = createRepository()
    const service = createAwardAlertsService({
      repository,
      providers: {},
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-1",
      runtimeStatus: () => ({ evaluator: { running: false }, notifier: { running: false } }),
      runEvaluator: vi.fn(),
      runNotifier: vi.fn(),
    })

    await expect(service.previewAlert({
      program: "aeroplan",
      origin: "SHA",
      destination: "HND",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
      cabin: "business",
    })).rejects.toThrow("unsupported award program: aeroplan")
  })

  it("fans out date-range preview searches before awaiting provider results", async () => {
    const { repository } = createRepository()
    type SearchFlight = {
      flightNo: string
      departureDateTime: string
      arrivalDateTime: string
      origin: string
      destination: string
      duration: number
      aircraft: string
      segmentCount: number
      amenities: { hasPods: boolean, hasWiFi: boolean }
      fares: {
        cabin: "business"
        miles: number
        cash: number
        currencyOfCash: string
        scraper: "alaska"
        bookingClass: string
        isSaverFare: boolean
      }[]
    }
    const resolvers: ((flights: SearchFlight[]) => void)[] = []
    const search = vi.fn(async () => {
      await Promise.resolve()
      return await new Promise<SearchFlight[]>((resolve) => {
        resolvers.push(resolve)
      })
    })
    const evaluateMatches = vi.fn(() => ({
      hasMatch: false,
      matchedDates: [],
      matchingResults: [],
      bestMatchSummary: undefined,
      matchFingerprint: "preview-fp",
      bookingUrl: "https://example.test/booking",
    }))
    const flights: SearchFlight[] = [{
      flightNo: "AS 843",
      departureDateTime: "2026-05-02 09:10",
      arrivalDateTime: "2026-05-02 11:50",
      origin: "SHA",
      destination: "HND",
      duration: 400,
      aircraft: "A321",
      segmentCount: 1,
      amenities: { hasPods: false, hasWiFi: true },
      fares: [{
        cabin: "business" as const,
        miles: 35000,
        cash: 5.6,
        currencyOfCash: "USD",
        scraper: "alaska" as const,
        bookingClass: "D",
        isSaverFare: false,
      }],
    }]

    const service = createAwardAlertsService({
      repository,
      providers: {
        alaska: {
          search,
          evaluateMatches,
        },
      },
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-1",
      runtimeStatus: () => ({ evaluator: { running: false }, notifier: { running: false } }),
      runEvaluator: vi.fn(),
      runNotifier: vi.fn(),
    })

    const previewPromise = service.previewAlert({
      program: "alaska",
      origin: "SHA",
      destination: "HND",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
      cabin: "business",
      maxMiles: 35000,
    })

    await Promise.resolve()

    expect(search).toHaveBeenCalledTimes(3)

    for (const resolve of resolvers)
      resolve(flights)

    await expect(previewPromise).resolves.toMatchObject({
      hasMatch: false,
      matchedDates: [],
    })
    expect(evaluateMatches).toHaveBeenCalledOnce()
  })

  it("returns the injected runtime status and forwards trigger calls", async () => {
    const { repository } = createRepository()
    const status = { evaluator: { running: true, lastStartedAt: "2026-04-20T00:00:00.000Z" }, notifier: { running: false }, databasePath: "./tmp/award-alerts.sqlite" }
    const runEvaluator = vi.fn(async () => {
      await Promise.resolve()
      return { started: true }
    })
    const runNotifier = vi.fn(async () => {
      await Promise.resolve()
      return { started: false, reason: "already_running" as const }
    })

    const service = createAwardAlertsService({
      repository,
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-1",
      runtimeStatus: () => status,
      runEvaluator,
      runNotifier,
    })

    expect(service.getStatus()).toBe(status)
    await expect(service.triggerEvaluatorRun()).resolves.toEqual({ started: true })
    await expect(service.triggerNotifierRun()).resolves.toEqual({ started: false, reason: "already_running" })
    expect(runEvaluator).toHaveBeenCalledOnce()
    expect(runNotifier).toHaveBeenCalledOnce()
  })

  it("runs raw scraper batches per item and localizes item failures", async () => {
    const { repository } = createRepository()
    const getRawScraperSearch = vi.fn(async (scraperName: string) => {
      await Promise.resolve()
      expect(scraperName).toBe("alaska")

      return async (query: AwardSearchQuery) => {
        await Promise.resolve()
        if (query.departureDate === "2026-05-03")
          throw new Error("timeout waiting for results")

        return {
          result: {
            flights: [{
              flightNo: "JL 82",
              miles: 32500,
            }],
          },
          logLines: ["search ok"],
        }
      }
    })

    const service = createAwardAlertsService({
      repository,
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-1",
      runtimeStatus: () => ({ evaluator: { running: false }, notifier: { running: false } }),
      runEvaluator: vi.fn(),
      runNotifier: vi.fn(),
      getRawScraperSearch,
    })

    await expect(service.runScraperBatch({
      scraperName: "alaska",
      items: [
        { origin: "SHA", destination: "HND", departureDate: "2026-05-02" },
        { origin: "SHA", destination: "HND", departureDate: "2026-05-03" },
      ],
    })).resolves.toEqual({
      scraperName: "alaska",
      results: [
        {
          origin: "SHA",
          destination: "HND",
          departureDate: "2026-05-02",
          ok: true,
          response: {
            result: {
              flights: [{
                flightNo: "JL 82",
                miles: 32500,
              }],
            },
            logLines: ["search ok"],
          },
        },
        {
          origin: "SHA",
          destination: "HND",
          departureDate: "2026-05-03",
          ok: false,
          error: "timeout waiting for results",
        },
      ],
    })

    expect(getRawScraperSearch).toHaveBeenCalledOnce()
  })

  it("rejects unsupported raw scraper batch requests before running items", async () => {
    const { repository } = createRepository()
    const getRawScraperSearch = vi.fn(async () => {
      await Promise.resolve()
      throw new Error("unsupported scraper: skyscanner")
    })

    const service = createAwardAlertsService({
      repository,
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-1",
      runtimeStatus: () => ({ evaluator: { running: false }, notifier: { running: false } }),
      runEvaluator: vi.fn(),
      runNotifier: vi.fn(),
      getRawScraperSearch,
    })

    await expect(service.runScraperBatch({
      scraperName: "skyscanner",
      items: [{ origin: "SHA", destination: "HND", departureDate: "2026-05-02" }],
    })).rejects.toThrow("unsupported scraper: skyscanner")
  })

  it("rejects impossible raw scraper batch dates before running items", async () => {
    const { repository } = createRepository()
    const getRawScraperSearch = vi.fn()

    const service = createAwardAlertsService({
      repository,
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-1",
      runtimeStatus: () => ({ evaluator: { running: false }, notifier: { running: false } }),
      runEvaluator: vi.fn(),
      runNotifier: vi.fn(),
      getRawScraperSearch,
    })

    await expect(service.runScraperBatch({
      scraperName: "alaska",
      items: [{ origin: "SHA", destination: "HND", departureDate: "2026-02-31" }],
    })).rejects.toThrow("items[0].departureDate must be a valid YYYY-MM-DD date")

    expect(getRawScraperSearch).not.toHaveBeenCalled()
  })

  it("rejects null raw scraper batch items with a stable validation error", async () => {
    const { repository } = createRepository()
    const service = createAwardAlertsService({
      repository,
      now: () => new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-1",
      runtimeStatus: () => ({ evaluator: { running: false }, notifier: { running: false } }),
      runEvaluator: vi.fn(),
      runNotifier: vi.fn(),
      getRawScraperSearch: vi.fn(),
    })

    await expect(service.runScraperBatch({
      scraperName: "alaska",
      items: [null as never],
    })).rejects.toThrow("items[0] must be an object")
  })
})
