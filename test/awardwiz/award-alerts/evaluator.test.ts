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
    const createNotificationEvent = vi.fn(async (_event: NotificationEvent) => undefined)
    const saveEvaluation = vi.fn(async (_evaluation: { alert: AwardAlert, state: AwardAlertState, run: AwardAlertRun }) => undefined)

    await evaluateOneAlert({
      alert,
      repository: {
        getState: async () => undefined,
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

  it("persists an unsupported-provider evaluation without creating a notification", async () => {
    const unsupportedAlert: AwardAlert = {
      ...alert,
      id: "alert-unsupported",
      program: "aeroplan",
    }
    const createNotificationEvent = vi.fn(async (_event: NotificationEvent) => undefined)
    const saveEvaluation = vi.fn(async (_evaluation: { alert: AwardAlert, state: AwardAlertState, run: AwardAlertRun }) => undefined)

    await evaluateOneAlert({
      alert: unsupportedAlert,
      repository: {
        getState: async () => undefined,
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
