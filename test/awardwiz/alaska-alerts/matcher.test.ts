import { describe, expect, it } from "vitest"
import { evaluateAlertMatches, shouldNotifyAgain } from "../../../awardwiz/backend/alaska-alerts/matcher.js"
import { AlaskaAlert, AlaskaAlertState } from "../../../awardwiz/backend/alaska-alerts/types.js"
import { FlightWithFares } from "../../../awardwiz/types/scrapers.js"

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

const flights = [{
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
    { cabin: "economy", miles: 30000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "S", isSaverFare: false },
    { cabin: "business", miles: 80000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
  ],
}] as Array<FlightWithFares & { segmentCount?: number }>

describe("evaluateAlertMatches", () => {
  it("keeps only fares that satisfy cabin, nonstop, miles, and cash rules", () => {
    const result = evaluateAlertMatches(alert, flights)

    expect(result.hasMatch).toBe(true)
    expect(result.matchedDates).toEqual(["2026-07-01"])
    expect(result.matchingResults).toEqual([
      expect.objectContaining({
        flightNo: "AS 843",
        cabin: "business",
        miles: 80000,
      }),
    ])
    expect(result.bestMatchSummary?.flightNo).toBe("AS 843")
    expect(result.matchFingerprint).toBeTruthy()
  })

  it("treats a missing segment count as nonstop when nonstopOnly is set", () => {
    const result = evaluateAlertMatches(alert, [
      { ...flights[0], segmentCount: undefined } as FlightWithFares & { segmentCount?: number },
    ])

    expect(result.hasMatch).toBe(true)
  })

  it("uses schedule before flight number for equal-quality fares and keeps fingerprints stable across input order", () => {
    const earlyFlight = {
      flightNo: "AS 900",
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
    } as FlightWithFares & { segmentCount?: number }

    const lateFlight = {
      ...earlyFlight,
      flightNo: "AS 100",
      departureDateTime: "2026-07-01 20:15",
      arrivalDateTime: "2026-07-01 22:44",
    }

    const earlyFingerprint = evaluateAlertMatches(alert, [earlyFlight]).matchFingerprint
    const lateFingerprint = evaluateAlertMatches(alert, [lateFlight]).matchFingerprint
    expect(earlyFingerprint).not.toBe(lateFingerprint)

    const forward = evaluateAlertMatches(alert, [earlyFlight, lateFlight])
    const reversed = evaluateAlertMatches(alert, [lateFlight, earlyFlight])

    expect(forward.matchFingerprint).toBe(reversed.matchFingerprint)
    expect(forward.matchingResults.map((match) => match.departureDateTime)).toEqual([
      "2026-07-01 19:42",
      "2026-07-01 20:15",
    ])
    expect(reversed.matchingResults.map((match) => match.departureDateTime)).toEqual([
      "2026-07-01 19:42",
      "2026-07-01 20:15",
    ])
    expect(forward.bestMatchSummary?.flightNo).toBe("AS 900")
  })

  it("picks the better fare even when a worse fare has an earlier schedule and flight number", () => {
    const expensiveFlight = {
      flightNo: "AS 100",
      departureDateTime: "2026-07-01 18:00",
      arrivalDateTime: "2026-07-01 20:30",
      origin: "SFO",
      destination: "HNL",
      duration: 330,
      aircraft: "Airbus A321",
      segmentCount: 1,
      amenities: { hasPods: false, hasWiFi: true },
      fares: [
        { cabin: "business", miles: 85000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
      ],
    } as FlightWithFares & { segmentCount?: number }

    const cheaperFlight = {
      flightNo: "AS 900",
      departureDateTime: "2026-07-01 21:00",
      arrivalDateTime: "2026-07-01 23:30",
      origin: "SFO",
      destination: "HNL",
      duration: 330,
      aircraft: "Airbus A321",
      segmentCount: 1,
      amenities: { hasPods: false, hasWiFi: true },
      fares: [
        { cabin: "business", miles: 70000, cash: 5.6, currencyOfCash: "USD", scraper: "alaska", bookingClass: "D", isSaverFare: false },
      ],
    } as FlightWithFares & { segmentCount?: number }

    const result = evaluateAlertMatches(alert, [expensiveFlight, cheaperFlight])

    expect(result.bestMatchSummary?.flightNo).toBe("AS 900")
    expect(result.bestMatchSummary?.miles).toBe(70000)
    expect(result.matchingResults.map((match) => match.flightNo)).toEqual(["AS 900", "AS 100"])
  })
})

describe("shouldNotifyAgain", () => {
  it("returns false inside the throttle window", () => {
    const state: AlaskaAlertState = {
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
    const state: AlaskaAlertState = {
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
