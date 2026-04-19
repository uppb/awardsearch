import { createHash, randomUUID } from "node:crypto"
import { expandAlertDates } from "./date-scope.js"
import { evaluateAlertMatches, shouldNotifyAgain } from "./matcher.js"
import type { AlaskaAlert, AlaskaAlertRun, AlaskaAlertState, AlaskaSearch, NotificationEvent } from "./types.js"
import type { FlightWithFares } from "../../types/scrapers.js"

export type AlertRepository = {
  getState: (alertId: string) => Promise<AlaskaAlertState | undefined>
  saveEvaluation: (evaluation: { alert?: AlaskaAlert, state: AlaskaAlertState, run: AlaskaAlertRun }) => Promise<void>
  createNotificationEvent: (event: NotificationEvent) => Promise<void>
}

type EvaluateOneAlertArgs = {
  alert: AlaskaAlert
  repository: AlertRepository
  searchAlaska: AlaskaSearch
  now: Date
}

type SearchOutcome = { date: string, flights: FlightWithFares[] } | { date: string, error: Error }

const buildNotificationEventId = (alertId: string, matchFingerprint: string, lastNotifiedAt: string | undefined) =>
  `notify-${createHash("sha1")
    .update(JSON.stringify({ alertId, matchFingerprint, lastNotifiedAt: lastNotifiedAt ?? null }))
    .digest("hex")}`

const buildBookingUrl = (origin: string, destination: string, date: string) =>
  `https://www.alaskaair.com/search/results?A=1&O=${origin}&D=${destination}&OD=${date}&OT=Anytime&RT=false&UPG=none&ShoppingMethod=onlineaward&locale=en-us`

export const evaluateOneAlert = async ({ alert, repository, searchAlaska, now }: EvaluateOneAlertArgs) => {
  const nowIso = now.toISOString()
  const searchedDates = expandAlertDates(alert)
  const priorState = await repository.getState(alert.id)
  const searchOutcomes: SearchOutcome[] = []
  for (const departureDate of searchedDates) {
    try {
      const flights = await searchAlaska({ origin: alert.origin, destination: alert.destination, departureDate })
      searchOutcomes.push({ date: departureDate, flights })
    } catch (error) {
      searchOutcomes.push({ date: departureDate, error: error as Error })
    }
  }

  const successfulFlights = searchOutcomes
    .filter((outcome): outcome is { date: string, flights: FlightWithFares[] } => "flights" in outcome)
    .flatMap((outcome) => outcome.flights)
  const scrapeErrors = searchOutcomes
    .filter((outcome): outcome is { date: string, error: Error } => "error" in outcome)
    .map((outcome) => outcome.error.message)

  const matchEvaluation = evaluateAlertMatches(alert, successfulFlights)
  const createNotification = matchEvaluation.hasMatch && (!priorState?.hasMatch || shouldNotifyAgain(alert, priorState, now))
  const bestMatchSummary = matchEvaluation.bestMatchSummary
  const bookingDate = bestMatchSummary?.date ?? matchEvaluation.matchedDates[0]!

  const state: AlaskaAlertState = {
    alertId: alert.id,
    hasMatch: matchEvaluation.hasMatch,
    matchedDates: matchEvaluation.matchedDates,
    matchingResults: matchEvaluation.matchingResults,
    bestMatchSummary: matchEvaluation.bestMatchSummary,
    matchFingerprint: matchEvaluation.matchFingerprint,
    lastMatchAt: matchEvaluation.hasMatch ? nowIso : priorState?.lastMatchAt,
    lastNotifiedAt: priorState?.lastNotifiedAt,
    lastErrorAt: scrapeErrors.length > 0 ? nowIso : undefined,
    lastErrorMessage: scrapeErrors[0],
    updatedAt: nowIso,
  }

  const run: AlaskaAlertRun = {
    id: randomUUID(),
    alertId: alert.id,
    startedAt: nowIso,
    completedAt: nowIso,
    searchedDates,
    scrapeCount: searchedDates.length,
    scrapeSuccessCount: searchedDates.length - scrapeErrors.length,
    scrapeErrorCount: scrapeErrors.length,
    matchedResultCount: matchEvaluation.matchingResults.length,
    hasMatch: matchEvaluation.hasMatch,
    errorSummary: scrapeErrors[0],
  }

  if (!createNotification)
    return repository.saveEvaluation({ alert, state, run })

  await repository.createNotificationEvent({
    id: buildNotificationEventId(alert.id, matchEvaluation.matchFingerprint, priorState?.lastNotifiedAt),
    alertId: alert.id,
    userId: alert.userId,
    createdAt: nowIso,
    channel: "email",
    payload: {
      origin: alert.origin,
      destination: alert.destination,
      cabin: alert.cabin,
      matchedDates: matchEvaluation.matchedDates,
      matchCount: matchEvaluation.matchingResults.length,
      nonstopOnly: alert.nonstopOnly,
      maxMiles: alert.maxMiles,
      maxCash: alert.maxCash,
      bestMatch: bestMatchSummary,
      bookingUrl: buildBookingUrl(alert.origin, alert.destination, bookingDate),
    },
    status: "pending",
    sentAt: undefined,
    failureReason: undefined,
  })

  await repository.saveEvaluation({
    state: {
      ...state,
      lastNotifiedAt: nowIso,
    },
    run,
  })
}
