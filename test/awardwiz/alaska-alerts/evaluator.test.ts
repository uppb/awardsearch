import { describe, expect, it, vi, beforeEach } from "vitest"
import { evaluateOneAlert } from "../../../awardwiz/backend/alaska-alerts/evaluator.js"
import { searchAlaska } from "../../../awardwiz/backend/alaska-alerts/alaska-search.js"
import { AlaskaAlert, AlaskaAlertState } from "../../../awardwiz/backend/alaska-alerts/types.js"
import { FlightWithFares } from "../../../awardwiz/types/scrapers.js"
import { runArkalis } from "../../../arkalis/arkalis.js"

vi.mock("../../../arkalis/arkalis.js", () => ({
  runArkalis: vi.fn(),
}))

vi.mock("../../../awardwiz-scrapers/scrapers/alaska.js", () => ({
  meta: { name: "alaska", blockUrls: [] },
  runScraper: vi.fn(),
}))

const alert: AlaskaAlert = {
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
  createdAt: "2026-04-18T00:00:00.000Z",
  updatedAt: "2026-04-18T00:00:00.000Z",
}

const flights: FlightWithFares[] = [{
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
}]

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe("searchAlaska", () => {
  beforeEach(() => {
    vi.mocked(runArkalis).mockReset()
  })

  it("returns parsed flights from the Alaska scraper run", async () => {
    vi.mocked(runArkalis).mockResolvedValue({ result: flights, logLines: [] })

    await expect(searchAlaska({ origin: "SFO", destination: "HNL", departureDate: "2026-07-01" })).resolves.toEqual(flights)
  })

  it("uses a cache key that includes the full departure date including year", async () => {
    vi.mocked(runArkalis).mockResolvedValue({ result: flights, logLines: [] })

    await searchAlaska({ origin: "SFO", destination: "HNL", departureDate: "2026-07-01" })

    expect(runArkalis).toHaveBeenCalledWith(expect.any(Function), expect.any(Object), expect.any(Object), "alaska-SFOHNL-2026-07-01")
  })

  it("throws when the Alaska scraper returns no result payload", async () => {
    vi.mocked(runArkalis).mockResolvedValue({ result: undefined, logLines: [] })

    await expect(searchAlaska({ origin: "SFO", destination: "HNL", departureDate: "2026-07-01" })).rejects.toThrow(
      "Alaska scraper returned no results"
    )
  })
})

describe("evaluateOneAlert", () => {
  it("persists state, run history, and notification events from Alaska results", async () => {
    const repo = {
      getState: vi.fn<[], Promise<AlaskaAlertState | undefined>>().mockResolvedValue(undefined),
      saveEvaluation: vi.fn().mockResolvedValue(undefined),
      createNotificationEvent: vi.fn().mockResolvedValue(undefined),
    }
    const search = vi.fn().mockResolvedValue(flights)

    await evaluateOneAlert({
      alert,
      repository: repo,
      searchAlaska: search,
      now: new Date("2026-04-18T06:00:00.000Z"),
    })

    expect(search).toHaveBeenCalledWith({ origin: "SFO", destination: "HNL", departureDate: "2026-07-01" })
    expect(repo.saveEvaluation).toHaveBeenCalledTimes(1)
    expect(repo.saveEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        alertId: "alert-1",
        hasMatch: true,
        matchedDates: ["2026-07-01"],
        lastMatchAt: "2026-04-18T06:00:00.000Z",
        lastNotifiedAt: "2026-04-18T06:00:00.000Z",
        lastErrorAt: undefined,
        lastErrorMessage: undefined,
      }),
      run: expect.objectContaining({
        alertId: "alert-1",
        searchedDates: ["2026-07-01"],
        scrapeCount: 1,
        scrapeSuccessCount: 1,
        scrapeErrorCount: 0,
        matchedResultCount: 1,
        hasMatch: true,
        errorSummary: undefined,
      }),
    }))
    expect(repo.createNotificationEvent).toHaveBeenCalledTimes(1)
    expect(repo.createNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      alertId: "alert-1",
      userId: "user-1",
      payload: expect.objectContaining({
        origin: "SFO",
        destination: "HNL",
        matchedDates: ["2026-07-01"],
        bestMatch: expect.objectContaining({
          flightNo: "AS 843",
          segmentCount: 1,
        }),
      }),
      status: "pending",
    }))
  })

  it("creates a Discord-ready notification payload with a bookingUrl for the best match date", async () => {
    const multiMatchFlights: FlightWithFares[] = [{
      ...flights[0]!,
      fares: [
        { cabin: "business", miles: 80000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
        { cabin: "business", miles: 81000, cash: 6.1, currencyOfCash: "USD", scraper: "alaska", bookingClass: "I", isSaverFare: false },
      ],
    }]
    const repo = {
      getState: vi.fn<[], Promise<AlaskaAlertState | undefined>>().mockResolvedValue(undefined),
      saveEvaluation: vi.fn().mockResolvedValue(undefined),
      createNotificationEvent: vi.fn().mockResolvedValue(undefined),
    }
    const search = vi.fn().mockResolvedValue(multiMatchFlights)

    await evaluateOneAlert({
      alert,
      repository: repo,
      searchAlaska: search,
      now: new Date("2026-04-18T06:00:00.000Z"),
    })

    expect(repo.createNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        origin: "SFO",
        destination: "HNL",
        cabin: "business",
        matchedDates: ["2026-07-01"],
        matchCount: 2,
        nonstopOnly: true,
        maxMiles: 90000,
        maxCash: 10,
        bestMatch: expect.objectContaining({
          date: "2026-07-01",
          flightNo: "AS 843",
        }),
        bookingUrl: "https://www.alaskaair.com/search/results?A=1&O=SFO&D=HNL&OD=2026-07-01&OT=Anytime&RT=false&UPG=none&ShoppingMethod=onlineaward&locale=en-us",
      }),
    }))
  })

  it("uses the prior persisted state when deciding whether to notify again", async () => {
    const previousState: AlaskaAlertState = {
      alertId: "alert-1",
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
      lastMatchAt: "2026-04-18T04:00:00.000Z",
      lastNotifiedAt: "2026-04-18T05:00:00.000Z",
      lastErrorAt: undefined,
      lastErrorMessage: undefined,
      updatedAt: "2026-04-18T05:00:00.000Z",
    }
    const repo = {
      getState: vi.fn<[], Promise<AlaskaAlertState | undefined>>().mockResolvedValue(previousState),
      saveEvaluation: vi.fn().mockResolvedValue(undefined),
      createNotificationEvent: vi.fn().mockResolvedValue(undefined),
    }
    const search = vi.fn().mockResolvedValue(flights)

    await evaluateOneAlert({
      alert,
      repository: repo,
      searchAlaska: search,
      now: new Date("2026-04-18T06:00:00.000Z"),
    })

    expect(repo.createNotificationEvent).not.toHaveBeenCalled()
    expect(repo.saveEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        lastNotifiedAt: "2026-04-18T05:00:00.000Z",
      }),
    }))
  })

  it("does not persist lastNotifiedAt before notification event creation succeeds", async () => {
    const repo = {
      getState: vi.fn<[], Promise<AlaskaAlertState | undefined>>().mockResolvedValue(undefined),
      saveEvaluation: vi.fn().mockResolvedValue(undefined),
      createNotificationEvent: vi.fn().mockRejectedValue(new Error("queue unavailable")),
    }
    const search = vi.fn().mockResolvedValue(flights)

    await expect(evaluateOneAlert({
      alert,
      repository: repo,
      searchAlaska: search,
      now: new Date("2026-04-18T06:00:00.000Z"),
    })).rejects.toThrow("queue unavailable")

    expect(repo.createNotificationEvent).toHaveBeenCalledTimes(1)
    expect(repo.saveEvaluation).not.toHaveBeenCalled()
  })

  it("reuses the same notification event id when a retry follows a failed state save", async () => {
    const createNotificationEvent = vi.fn().mockResolvedValue(undefined)
    const saveEvaluation = vi.fn()
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValue(undefined)
    const repo = {
      getState: vi.fn<[], Promise<AlaskaAlertState | undefined>>().mockResolvedValue(undefined),
      saveEvaluation,
      createNotificationEvent,
    }
    const search = vi.fn().mockResolvedValue(flights)
    const now = new Date("2026-04-18T06:00:00.000Z")

    await expect(evaluateOneAlert({
      alert,
      repository: repo,
      searchAlaska: search,
      now,
    })).rejects.toThrow("write failed")

    await evaluateOneAlert({
      alert,
      repository: repo,
      searchAlaska: search,
      now,
    })

    expect(createNotificationEvent).toHaveBeenCalledTimes(2)
    expect(createNotificationEvent.mock.calls[0]![0]!.id).toBe(createNotificationEvent.mock.calls[1]![0]!.id)
  })

  it("searches date ranges sequentially instead of starting all dates at once", async () => {
    const rangeAlert: AlaskaAlert = {
      ...alert,
      dateMode: "date_range",
      date: undefined,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
    }
    const repo = {
      getState: vi.fn<[], Promise<AlaskaAlertState | undefined>>().mockResolvedValue(undefined),
      saveEvaluation: vi.fn().mockResolvedValue(undefined),
      createNotificationEvent: vi.fn().mockResolvedValue(undefined),
    }
    const firstStarted = createDeferred<void>()
    const secondStarted = createDeferred<void>()
    const first = createDeferred<FlightWithFares[]>()
    const second = createDeferred<FlightWithFares[]>()
    const search = vi.fn()
      .mockImplementationOnce(() => {
        firstStarted.resolve()
        return first.promise
      })
      .mockImplementationOnce(() => {
        secondStarted.resolve()
        return second.promise
      })

    const evaluation = evaluateOneAlert({
      alert: rangeAlert,
      repository: repo,
      searchAlaska: search,
      now: new Date("2026-04-18T06:00:00.000Z"),
    })

    await firstStarted.promise
    expect(search).toHaveBeenNthCalledWith(1, { origin: "SFO", destination: "HNL", departureDate: "2026-07-01" })

    first.resolve([])
    await secondStarted.promise

    expect(search).toHaveBeenCalledTimes(2)
    expect(search).toHaveBeenNthCalledWith(2, { origin: "SFO", destination: "HNL", departureDate: "2026-07-02" })

    second.resolve([])
    await evaluation
  })

  it("records scrape errors but still keeps successful matches from other dates", async () => {
    const rangeAlert: AlaskaAlert = {
      ...alert,
      dateMode: "date_range",
      date: undefined,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
    }
    const repo = {
      getState: vi.fn<[], Promise<AlaskaAlertState | undefined>>().mockResolvedValue(undefined),
      saveEvaluation: vi.fn().mockResolvedValue(undefined),
      createNotificationEvent: vi.fn().mockResolvedValue(undefined),
    }
    const search = vi.fn()
      .mockResolvedValueOnce(flights)
      .mockRejectedValueOnce(new Error("alaska 500"))

    await evaluateOneAlert({
      alert: rangeAlert,
      repository: repo,
      searchAlaska: search,
      now: new Date("2026-04-18T06:00:00.000Z"),
    })

    expect(repo.saveEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        hasMatch: true,
        lastErrorAt: "2026-04-18T06:00:00.000Z",
        lastErrorMessage: "alaska 500",
      }),
      run: expect.objectContaining({
        scrapeCount: 2,
        scrapeSuccessCount: 1,
        scrapeErrorCount: 1,
        hasMatch: true,
        errorSummary: "alaska 500",
      }),
    }))
  })

  it("preserves the last successful match state when every date scrape fails", async () => {
    const rangeAlert: AlaskaAlert = {
      ...alert,
      dateMode: "date_range",
      date: undefined,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
    }
    const priorState: AlaskaAlertState = {
      alertId: "alert-1",
      hasMatch: true,
      matchedDates: ["2026-06-30"],
      matchingResults: [{
        date: "2026-06-30",
        flightNo: "AS 840",
        origin: "SFO",
        destination: "HNL",
        departureDateTime: "2026-06-30 19:42",
        arrivalDateTime: "2026-06-30 22:11",
        cabin: "business",
        miles: 81000,
        cash: 6.1,
        currencyOfCash: "USD",
        bookingClass: "D",
        segmentCount: 1,
      }],
      bestMatchSummary: {
        date: "2026-06-30",
        flightNo: "AS 840",
        origin: "SFO",
        destination: "HNL",
        departureDateTime: "2026-06-30 19:42",
        arrivalDateTime: "2026-06-30 22:11",
        cabin: "business",
        miles: 81000,
        cash: 6.1,
        currencyOfCash: "USD",
        bookingClass: "D",
        segmentCount: 1,
      },
      matchFingerprint: "fp-previous",
      lastMatchAt: "2026-04-18T05:00:00.000Z",
      lastNotifiedAt: "2026-04-18T05:30:00.000Z",
      lastErrorAt: undefined,
      lastErrorMessage: undefined,
      updatedAt: "2026-04-18T05:30:00.000Z",
    }
    const repo = {
      getState: vi.fn<[], Promise<AlaskaAlertState | undefined>>().mockResolvedValue(priorState),
      saveEvaluation: vi.fn().mockResolvedValue(undefined),
      createNotificationEvent: vi.fn().mockResolvedValue(undefined),
    }
    const search = vi.fn()
      .mockRejectedValueOnce(new Error("alaska 500"))
      .mockRejectedValueOnce(new Error("alaska 503"))

    await evaluateOneAlert({
      alert: rangeAlert,
      repository: repo,
      searchAlaska: search,
      now: new Date("2026-04-18T06:00:00.000Z"),
    })

    expect(repo.createNotificationEvent).not.toHaveBeenCalled()
    expect(repo.saveEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        hasMatch: true,
        matchedDates: ["2026-06-30"],
        matchingResults: expect.arrayContaining([expect.objectContaining({
          date: "2026-06-30",
          flightNo: "AS 840",
        })]),
        bestMatchSummary: expect.objectContaining({
          date: "2026-06-30",
          flightNo: "AS 840",
        }),
        matchFingerprint: "fp-previous",
        lastMatchAt: "2026-04-18T05:00:00.000Z",
        lastNotifiedAt: "2026-04-18T05:30:00.000Z",
        lastErrorAt: "2026-04-18T06:00:00.000Z",
        lastErrorMessage: "alaska 500",
      }),
      run: expect.objectContaining({
        scrapeCount: 2,
        scrapeSuccessCount: 0,
        scrapeErrorCount: 2,
        matchedResultCount: 0,
        hasMatch: false,
        errorSummary: "alaska 500",
      }),
    }))
  })
})
