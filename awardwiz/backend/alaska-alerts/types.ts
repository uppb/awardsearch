import type { FlightWithFares } from "../../types/scrapers.js"

export type AlaskaAlertDateMode = "single_date" | "date_range"

export type AlaskaAlertCabin = "economy" | "business" | "first"

export type AlaskaSearchQuery = {
  origin: string
  destination: string
  departureDate: string
}

export type AlaskaSearch = (query: AlaskaSearchQuery) => Promise<FlightWithFares[]>

export type AlaskaAlert = {
  id: string
  userId: string
  origin: string
  destination: string
  dateMode: AlaskaAlertDateMode
  date: string | undefined
  startDate: string | undefined
  endDate: string | undefined
  cabin: AlaskaAlertCabin
  nonstopOnly: boolean
  maxMiles: number | undefined
  maxCash: number | undefined
  active: boolean
  pollIntervalMinutes: number
  minNotificationIntervalMinutes: number
  lastCheckedAt: string | undefined
  createdAt: string
  updatedAt: string
}

export type AlaskaAlertState = {
  alertId: string
  hasMatch: boolean
  matchedDates: string[]
  matchingResults: AlaskaAlertMatch[]
  bestMatchSummary: AlaskaAlertMatch | undefined
  matchFingerprint: string
  lastMatchAt: string | undefined
  lastNotifiedAt: string | undefined
  lastErrorAt: string | undefined
  lastErrorMessage: string | undefined
  updatedAt: string
}

export type AlaskaAlertMatch = {
  date: string
  flightNo: string
  origin: string
  destination: string
  departureDateTime: string
  arrivalDateTime: string
  cabin: AlaskaAlertCabin
  miles: number
  cash: number
  currencyOfCash: string
  bookingClass: string | undefined
  segmentCount: number
}

export type AlaskaAlertRun = {
  id: string
  alertId: string
  startedAt: string
  completedAt: string
  searchedDates: string[]
  scrapeCount: number
  scrapeSuccessCount: number
  scrapeErrorCount: number
  matchedResultCount: number
  hasMatch: boolean
  errorSummary: string | undefined
}

export type NotificationEvent = {
  id: string
  alertId: string
  userId: string
  createdAt: string
  status: "pending" | "processing" | "attempting" | "sent" | "failed"
  claimedAt?: string
  payload: {
    origin: string
    destination: string
    cabin: AlaskaAlertCabin
    matchedDates: string[]
    matchCount: number
    nonstopOnly: boolean
    maxMiles: number | undefined
    maxCash: number | undefined
    bestMatch: AlaskaAlertMatch | undefined
    bookingUrl: string
  }
  sentAt: string | undefined
  failureReason: string | undefined
}
