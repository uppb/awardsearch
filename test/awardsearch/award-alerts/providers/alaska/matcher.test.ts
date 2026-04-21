import { describe, expect, it } from "vitest"
import { alaskaProvider } from "../../../../../awardsearch/backend/award-alerts/providers/alaska/matcher.js"
import { evaluateAlertMatches, shouldNotifyAgain } from "../../../../../awardsearch/backend/award-alerts/providers/alaska/matcher-core.js"
import type { AwardAlert, AwardAlertState } from "../../../../../awardsearch/backend/award-alerts/types.js"
import type { FlightWithFares } from "../../../../../awardsearch/types/scrapers.js"

const baseAlert = {
  id: "alert-1",
  program: "alaska",
  userId: "user-1",
  origin: "SFO",
  destination: "HNL",
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
} as const satisfies Omit<AwardAlert, "dateMode" | "date" | "startDate" | "endDate">

const buildAlert = (overrides: Partial<AwardAlert>): AwardAlert => ({
  ...baseAlert,
  ...overrides,
} as AwardAlert)

const buildFlight = (overrides: Partial<FlightWithFares> & { segmentCount?: number } = {}): FlightWithFares => ({
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
  ...overrides,
}) as FlightWithFares

describe("evaluateAlertMatches", () => {
  it("uses the best matched date when building the booking URL", () => {
    const alert = buildAlert({
      dateMode: "date_range",
      date: undefined,
      startDate: "2026-07-01",
      endDate: "2026-07-02",
    })

    const result = evaluateAlertMatches(alert, [
      buildFlight({
        flightNo: "AS 843",
        departureDateTime: "2026-07-01 19:42",
        arrivalDateTime: "2026-07-01 22:11",
        fares: [
          { cabin: "business", miles: 80000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
        ],
      }),
      buildFlight({
        flightNo: "AS 844",
        departureDateTime: "2026-07-02 19:42",
        arrivalDateTime: "2026-07-02 22:11",
        fares: [
          { cabin: "business", miles: 70000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
        ],
      }),
    ])

    expect(result.bestMatchSummary?.date).toBe("2026-07-02")
    expect(result.bookingUrl).toBe(
      "https://www.alaskaair.com/search/results?A=1&O=SFO&D=HNL&OD=2026-07-02&OT=Anytime&RT=false&UPG=none&ShoppingMethod=onlineaward&locale=en-us",
    )
  })

  it("filters by cabin, nonstop, miles, and cash", () => {
    const alert = buildAlert({
      dateMode: "single_date",
      date: "2026-07-01",
      startDate: undefined,
      endDate: undefined,
      cabin: "business",
      nonstopOnly: true,
      maxMiles: 75000,
      maxCash: 10,
    })

    const result = evaluateAlertMatches(alert, [
      buildFlight({
        flightNo: "AS 843",
        fares: [
          { cabin: "economy", miles: 70000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "S", isSaverFare: false },
          { cabin: "business", miles: 70000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
          { cabin: "business", miles: 80000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
          { cabin: "business", miles: 70000, cash: 15, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
        ],
      }),
      buildFlight({
        flightNo: "AS 845",
        departureDateTime: "2026-07-01 20:30",
        arrivalDateTime: "2026-07-01 23:30",
        segmentCount: 2,
        fares: [
          { cabin: "business", miles: 70000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
        ],
      }),
    ])

    expect(result.hasMatch).toBe(true)
    expect(result.matchedDates).toEqual(["2026-07-01"])
    expect(result.matchingResults).toEqual([
      expect.objectContaining({
        flightNo: "AS 843",
        cabin: "business",
        miles: 70000,
        cash: 5.6,
        segmentCount: 1,
      }),
    ])
  })

  it("treats missing segmentCount as nonstop", () => {
    const alert = buildAlert({
      dateMode: "single_date",
      date: "2026-07-01",
      startDate: undefined,
      endDate: undefined,
      nonstopOnly: true,
    })

    const result = evaluateAlertMatches(alert, [
      buildFlight({
        segmentCount: undefined,
        fares: [
          { cabin: "business", miles: 80000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
        ],
      }),
    ])

    expect(result.hasMatch).toBe(true)
    expect(result.matchingResults[0]?.segmentCount).toBe(1)
  })

  it("keeps fingerprints and ordering stable across input order", () => {
    const alert = buildAlert({
      dateMode: "single_date",
      date: "2026-07-01",
      startDate: undefined,
      endDate: undefined,
      nonstopOnly: false,
    })

    const earlyFlight = buildFlight({
      flightNo: "AS 900",
      departureDateTime: "2026-07-01 19:42",
      arrivalDateTime: "2026-07-01 22:11",
      fares: [
        { cabin: "business", miles: 80000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
      ],
    })
    const lateFlight = buildFlight({
      flightNo: "AS 100",
      departureDateTime: "2026-07-01 20:15",
      arrivalDateTime: "2026-07-01 22:44",
      fares: [
        { cabin: "business", miles: 80000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
      ],
    })

    const forward = evaluateAlertMatches(alert, [earlyFlight, lateFlight])
    const reversed = evaluateAlertMatches(alert, [lateFlight, earlyFlight])

    expect(forward.matchFingerprint).toBe(reversed.matchFingerprint)
    expect(forward.matchingResults.map((match) => match.flightNo)).toEqual(["AS 900", "AS 100"])
    expect(reversed.matchingResults.map((match) => match.flightNo)).toEqual(["AS 900", "AS 100"])
  })

  it("prefers the better fare even when it departs later", () => {
    const alert = buildAlert({
      dateMode: "single_date",
      date: "2026-07-01",
      startDate: undefined,
      endDate: undefined,
      nonstopOnly: false,
    })

    const worseFlight = buildFlight({
      flightNo: "AS 100",
      departureDateTime: "2026-07-01 18:00",
      arrivalDateTime: "2026-07-01 20:30",
      fares: [
        { cabin: "business", miles: 85000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
      ],
    })
    const betterFlight = buildFlight({
      flightNo: "AS 900",
      departureDateTime: "2026-07-01 21:00",
      arrivalDateTime: "2026-07-01 23:30",
      fares: [
        { cabin: "business", miles: 70000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
      ],
    })

    const result = evaluateAlertMatches(alert, [worseFlight, betterFlight])

    expect(result.bestMatchSummary?.flightNo).toBe("AS 900")
    expect(result.bestMatchSummary?.miles).toBe(70000)
    expect(result.matchingResults.map((match) => match.flightNo)).toEqual(["AS 900", "AS 100"])
    expect(alaskaProvider.evaluateMatches(alert, [worseFlight, betterFlight]).bookingUrl).toContain("OD=2026-07-01")
  })
})

describe("shouldNotifyAgain", () => {
  it("returns false inside the throttle window", () => {
    const alert = buildAlert({
      dateMode: "single_date",
      date: "2026-07-01",
      startDate: undefined,
      endDate: undefined,
    })
    const state: AwardAlertState = {
      alertId: "alert-1",
      hasMatch: true,
      matchedDates: ["2026-07-01"],
      matchingResults: [],
      bestMatchSummary: undefined,
      matchFingerprint: "fp-1",
      lastMatchAt: "2026-04-18T00:00:00.000Z",
      lastNotifiedAt: "2026-04-18T01:00:00.000Z",
      lastErrorAt: undefined,
      lastErrorMessage: undefined,
      updatedAt: "2026-04-18T01:00:00.000Z",
    }

    expect(shouldNotifyAgain(alert, state, new Date("2026-04-18T03:30:00.000Z"))).toBe(false)
  })

  it("returns true after the throttle window elapses", () => {
    const alert = buildAlert({
      dateMode: "single_date",
      date: "2026-07-01",
      startDate: undefined,
      endDate: undefined,
    })
    const state: AwardAlertState = {
      alertId: "alert-1",
      hasMatch: true,
      matchedDates: ["2026-07-01"],
      matchingResults: [],
      bestMatchSummary: undefined,
      matchFingerprint: "fp-1",
      lastMatchAt: "2026-04-18T00:00:00.000Z",
      lastNotifiedAt: "2026-04-18T01:00:00.000Z",
      lastErrorAt: undefined,
      lastErrorMessage: undefined,
      updatedAt: "2026-04-18T01:00:00.000Z",
    }

    expect(shouldNotifyAgain(alert, state, new Date("2026-04-18T04:01:00.000Z"))).toBe(true)
  })
})
