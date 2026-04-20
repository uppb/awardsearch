import { describe, expect, it, vi } from "vitest"
import { evaluateOneAlert } from "../../../awardwiz/backend/award-alerts/evaluator.js"
import type {
  AwardAlert,
  AwardAlertMatch,
  AwardAlertRun,
  AwardAlertState,
  NotificationEvent,
} from "../../../awardwiz/backend/award-alerts/types.js"
import type { FlightWithFares } from "../../../awardwiz/types/scrapers.js"

const alert: AwardAlert = {
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
  pollIntervalMinutes: 60,
  minNotificationIntervalMinutes: 180,
  lastCheckedAt: undefined,
  nextCheckAt: undefined,
  createdAt: "2026-04-18T00:00:00.000Z",
  updatedAt: "2026-04-18T00:00:00.000Z",
}

const match: AwardAlertMatch = {
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
}

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

describe("evaluateOneAlert", () => {
  it("creates a notification event with an Alaska booking URL when a match exists", async () => {
    const createNotificationEvent = vi.fn((_event: NotificationEvent) => undefined)
    const saveEvaluation = vi.fn((_evaluation: { alert: AwardAlert, state: AwardAlertState, run: AwardAlertRun }) => undefined)

    await evaluateOneAlert({
      alert,
      repository: {
        getState: () => undefined,
        saveEvaluation,
        createNotificationEvent,
      },
      providers: {
        alaska: {
          search: async () => [matchingFlight],
          evaluateMatches: () => ({
            hasMatch: true,
            matchedDates: ["2026-07-01"],
            matchingResults: [match],
            bestMatchSummary: match,
            matchFingerprint: "fingerprint-1",
            bookingUrl: "https://www.alaskaair.com/search/results?A=1&O=SFO&D=HNL&OD=2026-07-01&OT=Anytime&RT=false&UPG=none&ShoppingMethod=onlineaward&locale=en-us",
          }),
        },
      },
      now: new Date("2026-04-19T00:00:00.000Z"),
    })

    expect(createNotificationEvent).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        bookingUrl: expect.stringContaining("alaskaair.com/search/results"),
      }),
    }))
    expect(saveEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        lastNotifiedAt: "2026-04-19T00:00:00.000Z",
      }),
    }))
  })

  it("does not create a notification when the last notification is still inside the throttle interval", async () => {
    const priorState: AwardAlertState = {
      alertId: alert.id,
      hasMatch: true,
      matchedDates: ["2026-07-01"],
      matchingResults: [match],
      bestMatchSummary: match,
      matchFingerprint: "fingerprint-0",
      lastMatchAt: "2026-04-18T22:00:00.000Z",
      lastNotifiedAt: "2026-04-18T23:30:00.000Z",
      lastErrorAt: undefined,
      lastErrorMessage: undefined,
      updatedAt: "2026-04-18T23:30:00.000Z",
    }
    const createNotificationEvent = vi.fn((_event: NotificationEvent) => undefined)
    const saveEvaluation = vi.fn((_evaluation: { alert: AwardAlert, state: AwardAlertState, run: AwardAlertRun }) => undefined)

    await evaluateOneAlert({
      alert,
      repository: {
        getState: () => priorState,
        saveEvaluation,
        createNotificationEvent,
      },
      providers: {
        alaska: {
          search: async () => [matchingFlight],
          evaluateMatches: () => ({
            hasMatch: true,
            matchedDates: ["2026-07-01"],
            matchingResults: [match],
            bestMatchSummary: match,
            matchFingerprint: "fingerprint-1",
            bookingUrl: "https://www.alaskaair.com/search/results?A=1&O=SFO&D=HNL&OD=2026-07-01&OT=Anytime&RT=false&UPG=none&ShoppingMethod=onlineaward&locale=en-us",
          }),
        },
      },
      now: new Date("2026-04-19T00:00:00.000Z"),
    })

    expect(createNotificationEvent).not.toHaveBeenCalled()
    expect(saveEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      state: expect.objectContaining({
        hasMatch: true,
        lastMatchAt: "2026-04-19T00:00:00.000Z",
        lastNotifiedAt: "2026-04-18T23:30:00.000Z",
        matchFingerprint: "fingerprint-1",
      }),
      run: expect.objectContaining({
        scrapeCount: 1,
        scrapeSuccessCount: 1,
        scrapeErrorCount: 0,
        hasMatch: true,
      }),
    }))
  })

  it("preserves the prior match state when a partial scrape fails without a new match", async () => {
    const priorState: AwardAlertState = {
      alertId: alert.id,
      hasMatch: true,
      matchedDates: ["2026-07-01"],
      matchingResults: [match],
      bestMatchSummary: match,
      matchFingerprint: "fingerprint-0",
      lastMatchAt: "2026-04-18T12:00:00.000Z",
      lastNotifiedAt: "2026-04-18T09:00:00.000Z",
      lastErrorAt: undefined,
      lastErrorMessage: undefined,
      updatedAt: "2026-04-18T12:00:00.000Z",
    }
    const dateRangeAlert: AwardAlert = {
      ...alert,
      dateMode: "date_range",
      date: undefined,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
    }
    const createNotificationEvent = vi.fn((_event: NotificationEvent) => undefined)
    const saveEvaluation = vi.fn((_evaluation: { alert: AwardAlert, state: AwardAlertState, run: AwardAlertRun }) => undefined)
    const search = vi.fn(async ({ departureDate }: { departureDate: string }) => {
      if (departureDate === "2026-07-02")
        throw new Error("upstream timeout")
      return [] satisfies FlightWithFares[]
    })

    await evaluateOneAlert({
      alert: dateRangeAlert,
      repository: {
        getState: () => priorState,
        saveEvaluation,
        createNotificationEvent,
      },
      providers: {
        alaska: {
          search,
          evaluateMatches: () => ({
            hasMatch: false,
            matchedDates: [],
            matchingResults: [],
            bestMatchSummary: undefined,
            matchFingerprint: "",
            bookingUrl: "https://www.alaskaair.com/search/results?A=1&O=SFO&D=HNL&OD=2026-07-01&OT=Anytime&RT=false&UPG=none&ShoppingMethod=onlineaward&locale=en-us",
          }),
        },
      },
      now: new Date("2026-04-19T00:00:00.000Z"),
    })

    expect(search).toHaveBeenCalledTimes(2)
    expect(createNotificationEvent).not.toHaveBeenCalled()
    expect(saveEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      alert: dateRangeAlert,
      state: expect.objectContaining({
        hasMatch: true,
        matchedDates: ["2026-07-01"],
        matchingResults: [match],
        bestMatchSummary: match,
        matchFingerprint: "fingerprint-0",
        lastMatchAt: "2026-04-18T12:00:00.000Z",
        lastNotifiedAt: "2026-04-18T09:00:00.000Z",
        lastErrorAt: "2026-04-19T00:00:00.000Z",
        lastErrorMessage: "upstream timeout",
      }),
      run: expect.objectContaining({
        searchedDates: ["2026-07-01", "2026-07-02"],
        scrapeCount: 2,
        scrapeSuccessCount: 1,
        scrapeErrorCount: 1,
        matchedResultCount: 0,
        hasMatch: false,
        errorSummary: "upstream timeout",
      }),
    }))
  })

  it("persists an unsupported-provider evaluation without creating a notification", async () => {
    const unsupportedAlert: AwardAlert = {
      ...alert,
      id: "alert-unsupported",
      program: "aeroplan",
    }
    const createNotificationEvent = vi.fn((_event: NotificationEvent) => undefined)
    const saveEvaluation = vi.fn((_evaluation: { alert: AwardAlert, state: AwardAlertState, run: AwardAlertRun }) => undefined)

    await evaluateOneAlert({
      alert: unsupportedAlert,
      repository: {
        getState: () => undefined,
        saveEvaluation,
        createNotificationEvent,
      },
      providers: {},
      now: new Date("2026-04-19T00:00:00.000Z"),
    })

    expect(createNotificationEvent).not.toHaveBeenCalled()
    expect(saveEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      alert: unsupportedAlert,
      state: expect.objectContaining({
        alertId: "alert-unsupported",
        hasMatch: false,
        lastErrorMessage: "unsupported award program: aeroplan",
      }),
      run: expect.objectContaining({
        alertId: "alert-unsupported",
        searchedDates: [],
        scrapeCount: 0,
        scrapeSuccessCount: 0,
        scrapeErrorCount: 0,
        matchedResultCount: 0,
        hasMatch: false,
        errorSummary: "unsupported award program: aeroplan",
      }),
    }))
  })
})
