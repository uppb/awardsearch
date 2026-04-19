import { expandAlertDates } from "./date-scope.js"
import type { AlaskaAlert, AlaskaAlertMatch, AlaskaAlertState } from "./types.js"
import type { FlightWithFares } from "../../types/scrapers.js"

type FlightWithOptionalSegmentCount = FlightWithFares & { segmentCount?: number }

export type AlaskaAlertEvaluationResult = {
  hasMatch: boolean
  matchedDates: string[]
  matchingResults: AlaskaAlertMatch[]
  bestMatchSummary: AlaskaAlertMatch | undefined
  matchFingerprint: string
}

const normalizeRoute = (value: string) => value.trim().toUpperCase()
const getFlightDate = (departureDateTime: string) => departureDateTime.slice(0, 10)

const compareMatches = (left: AlaskaAlertMatch, right: AlaskaAlertMatch) =>
  left.miles - right.miles ||
  left.cash - right.cash ||
  left.date.localeCompare(right.date) ||
  left.departureDateTime.localeCompare(right.departureDateTime) ||
  left.arrivalDateTime.localeCompare(right.arrivalDateTime) ||
  left.flightNo.localeCompare(right.flightNo) ||
  left.cabin.localeCompare(right.cabin) ||
  left.currencyOfCash.localeCompare(right.currencyOfCash) ||
  (left.bookingClass ?? "").localeCompare(right.bookingClass ?? "") ||
  left.segmentCount - right.segmentCount

const serializeMatch = (match: AlaskaAlertMatch) => ({
  date: match.date,
  flightNo: match.flightNo,
  cabin: match.cabin,
  miles: match.miles,
  cash: match.cash,
  currencyOfCash: match.currencyOfCash,
  bookingClass: match.bookingClass,
  departureDateTime: match.departureDateTime,
  arrivalDateTime: match.arrivalDateTime,
  segmentCount: match.segmentCount,
})

export const evaluateAlertMatches = (alert: AlaskaAlert, flights: FlightWithFares[]): AlaskaAlertEvaluationResult => {
  const alertDates = new Set(expandAlertDates(alert))
  const results: AlaskaAlertMatch[] = []

  for (const flight of flights) {
    if (normalizeRoute(flight.origin) !== normalizeRoute(alert.origin)) continue
    if (normalizeRoute(flight.destination) !== normalizeRoute(alert.destination)) continue

    const flightDate = getFlightDate(flight.departureDateTime)
    if (!alertDates.has(flightDate)) continue

    const segmentCount = (flight as FlightWithOptionalSegmentCount).segmentCount ?? 1
    if (alert.nonstopOnly && segmentCount !== 1) continue

    for (const fare of flight.fares) {
      if (fare.cabin !== alert.cabin) continue
      if (alert.maxMiles !== undefined && fare.miles > alert.maxMiles) continue
      if (alert.maxCash !== undefined && fare.cash > alert.maxCash) continue

      results.push({
        date: flightDate,
        flightNo: flight.flightNo,
        origin: flight.origin,
        destination: flight.destination,
        departureDateTime: flight.departureDateTime,
        arrivalDateTime: flight.arrivalDateTime,
        cabin: fare.cabin as AlaskaAlertMatch["cabin"],
        miles: fare.miles,
        cash: fare.cash,
        currencyOfCash: fare.currencyOfCash,
        bookingClass: fare.bookingClass,
        segmentCount,
      })
    }
  }

  const matchingResults = results.sort(compareMatches)
  const matchedDates = [...new Set(matchingResults.map((match) => match.date))]

  return {
    hasMatch: matchingResults.length > 0,
    matchedDates,
    matchingResults,
    bestMatchSummary: matchingResults[0],
    matchFingerprint: JSON.stringify(matchingResults.map(serializeMatch)),
  }
}

export const shouldNotifyAgain = (
  alert: AlaskaAlert,
  state: AlaskaAlertState,
  now: Date,
): boolean => {
  if (!state.hasMatch) return false
  if (!state.lastNotifiedAt) return true

  const lastNotifiedAt = new Date(state.lastNotifiedAt)
  if (Number.isNaN(lastNotifiedAt.getTime())) return false

  const throttleWindowMs = alert.minNotificationIntervalMinutes * 60 * 1000
  return now.getTime() - lastNotifiedAt.getTime() >= throttleWindowMs
}
