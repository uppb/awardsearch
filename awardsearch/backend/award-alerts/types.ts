import type { FlightWithFares } from "../../types/scrapers.js"

export type AwardProgram = string
export type AwardAlertDateMode = "single_date" | "date_range"
export type AwardAlertCabin = "economy" | "business" | "first"

export type AwardAlertMatch = {
  date: string
  flightNo: string
  origin: string
  destination: string
  departureDateTime: string
  arrivalDateTime: string
  cabin: AwardAlertCabin
  miles: number
  cash: number
  currencyOfCash: string
  bookingClass: string | undefined
  segmentCount: number
}

export type AwardAlertState = {
  alertId: string
  hasMatch: boolean
  matchedDates: string[]
  matchingResults: AwardAlertMatch[]
  bestMatchSummary: AwardAlertMatch | undefined
  matchFingerprint: string
  lastMatchAt: string | undefined
  lastNotifiedAt: string | undefined
  lastErrorAt: string | undefined
  lastErrorMessage: string | undefined
  updatedAt: string
}

export type AwardAlertRun = {
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

export type NotificationEventStatus =
  | "pending"
  | "processing"
  | "delivered_unconfirmed"
  | "sent"
  | "failed"

export type NotificationEventPayload = {
  origin: string
  destination: string
  cabin: AwardAlertCabin
  matchedDates: string[]
  matchCount: number
  nonstopOnly: boolean
  maxMiles: number | undefined
  maxCash: number | undefined
  bestMatch: AwardAlertMatch | undefined
  bookingUrl: string
}

export type NotificationEvent = {
  id: string
  alertId: string
  userId: string | undefined
  createdAt: string
  status: NotificationEventStatus
  claimedAt?: string
  claimToken?: string
  attemptedAt?: string
  payload: NotificationEventPayload
  sentAt: string | undefined
  failureReason: string | undefined
}

export type AwardSearchQuery = {
  origin: string
  destination: string
  departureDate: string
}

export type RawScraperBatchInput = {
  scraperName: string
  items: AwardSearchQuery[]
}

export type RawScraperBatchItemResult =
  | (AwardSearchQuery & {
      ok: true
      response: {
        result: unknown
        logLines: string[]
      }
    })
  | (AwardSearchQuery & {
      ok: false
      error: string
      response?: {
        result: unknown
        logLines: string[]
      }
    })

export type RawScraperBatchResult = {
  scraperName: string
  results: RawScraperBatchItemResult[]
}

export type AwardSearch = (query: AwardSearchQuery) => Promise<FlightWithFares[]>

export type AwardAlertMatchEvaluation = {
  hasMatch: boolean
  matchedDates: string[]
  matchingResults: AwardAlertMatch[]
  bestMatchSummary: AwardAlertMatch | undefined
  matchFingerprint: string
  bookingUrl: string
}

export type AwardAlertProvider = {
  search: AwardSearch
  evaluateMatches: (alert: AwardAlert, flights: FlightWithFares[]) => AwardAlertMatchEvaluation
}

export type AwardAlertProviders = Partial<Record<AwardProgram, AwardAlertProvider>>

export type AwardAlertsRepository = {
  getState: (alertId: string) => AwardAlertState | undefined
  saveEvaluation: (evaluation: { alert: AwardAlert, state: AwardAlertState, run: AwardAlertRun }) => void
  createNotificationEvent: (event: NotificationEvent) => void
}

type AwardAlertBase = {
  id: string
  program: AwardProgram
  userId: string | undefined
  origin: string
  destination: string
  cabin: AwardAlertCabin
  nonstopOnly: boolean
  maxMiles: number | undefined
  maxCash: number | undefined
  active: boolean
  pollIntervalMinutes: number
  minNotificationIntervalMinutes: number
  lastCheckedAt: string | undefined
  nextCheckAt: string | undefined
  createdAt: string
  updatedAt: string
}

export type AwardAlert =
  | (AwardAlertBase & {
      dateMode: "single_date"
      date: string
      startDate?: never
      endDate?: never
    })
  | (AwardAlertBase & {
      dateMode: "date_range"
      date?: never
      startDate: string
      endDate: string
    })
