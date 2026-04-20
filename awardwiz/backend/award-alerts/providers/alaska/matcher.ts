import { evaluateAlertMatches } from "../../../alaska-alerts/matcher.js"
import type { AwardAlert, AwardAlertProvider } from "../../types.js"
import type { FlightWithFares } from "../../../../types/scrapers.js"
import { searchAlaskaProvider } from "./search.js"

const buildBookingUrl = (origin: string, destination: string, date: string) =>
  `https://www.alaskaair.com/search/results?A=1&O=${origin}&D=${destination}&OD=${date}&OT=Anytime&RT=false&UPG=none&ShoppingMethod=onlineaward&locale=en-us`

const evaluateAlaskaMatches: AwardAlertProvider["evaluateMatches"] = (alert: AwardAlert, flights: FlightWithFares[]) => {
  const result = evaluateAlertMatches({
    id: alert.id,
    userId: alert.userId,
    origin: alert.origin,
    destination: alert.destination,
    dateMode: alert.dateMode,
    date: alert.dateMode === "single_date" ? alert.date : undefined,
    startDate: alert.dateMode === "date_range" ? alert.startDate : undefined,
    endDate: alert.dateMode === "date_range" ? alert.endDate : undefined,
    cabin: alert.cabin,
    nonstopOnly: alert.nonstopOnly,
    maxMiles: alert.maxMiles,
    maxCash: alert.maxCash,
    active: alert.active,
    pollIntervalMinutes: alert.pollIntervalMinutes,
    minNotificationIntervalMinutes: alert.minNotificationIntervalMinutes,
    lastCheckedAt: alert.lastCheckedAt,
    nextCheckAt: alert.nextCheckAt,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
  }, flights)

  const bookingDate = result.bestMatchSummary?.date ?? result.matchedDates[0]
  return {
    ...result,
    bookingUrl: buildBookingUrl(alert.origin, alert.destination, bookingDate ?? alert.date ?? alert.startDate ?? ""),
  }
}

export const alaskaProvider: AwardAlertProvider = {
  search: searchAlaskaProvider,
  evaluateMatches: evaluateAlaskaMatches,
}
