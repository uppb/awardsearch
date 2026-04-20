import { createHash, randomUUID } from "node:crypto"
import { expandAlertDates } from "./date-scope.js"
import type {
  AwardAlert,
  AwardAlertRun,
  AwardAlertState,
  AwardAlertProviders,
  AwardAlertsRepository,
  NotificationEvent,
} from "./types.js"
import type { FlightWithFares } from "../../types/scrapers.js"

type EvaluateOneAlertArgs = {
  alert: AwardAlert
  repository: AwardAlertsRepository
  providers: AwardAlertProviders
  now: Date
}

type SuccessfulSearchOutcome = { date: string, flights: FlightWithFares[] }
type FailedSearchOutcome = { date: string, error: Error }
type SearchOutcome = SuccessfulSearchOutcome | FailedSearchOutcome

const shouldNotifyAgain = (alert: AwardAlert, state: AwardAlertState, now: Date): boolean => {
  if (!state.hasMatch) return false
  if (!state.lastNotifiedAt) return true

  const lastNotifiedAt = new Date(state.lastNotifiedAt)
  if (Number.isNaN(lastNotifiedAt.getTime())) return false

  const throttleWindowMs = alert.minNotificationIntervalMinutes * 60 * 1000
  return now.getTime() - lastNotifiedAt.getTime() >= throttleWindowMs
}

const buildNotificationEventId = (alertId: string, matchFingerprint: string, lastNotifiedAt: string | undefined) =>
  `notify-${createHash("sha1")
    .update(JSON.stringify({ alertId, matchFingerprint, lastNotifiedAt: lastNotifiedAt ?? null }))
    .digest("hex")}`

const unsupportedProviderMessage = (program: string) => `unsupported award program: ${program}`

const buildUnsupportedProviderState = (alert: AwardAlert, nowIso: string): AwardAlertState => ({
  alertId: alert.id,
  hasMatch: false,
  matchedDates: [],
  matchingResults: [],
  bestMatchSummary: undefined,
  matchFingerprint: "",
  lastMatchAt: undefined,
  lastNotifiedAt: undefined,
  lastErrorAt: nowIso,
  lastErrorMessage: unsupportedProviderMessage(alert.program),
  updatedAt: nowIso,
})

const buildUnsupportedProviderRun = (alert: AwardAlert, nowIso: string): AwardAlertRun => ({
  id: randomUUID(),
  alertId: alert.id,
  startedAt: nowIso,
  completedAt: nowIso,
  searchedDates: [],
  scrapeCount: 0,
  scrapeSuccessCount: 0,
  scrapeErrorCount: 0,
  matchedResultCount: 0,
  hasMatch: false,
  errorSummary: unsupportedProviderMessage(alert.program),
})

export const evaluateOneAlert = async ({ alert, repository, providers, now }: EvaluateOneAlertArgs) => {
  const nowIso = now.toISOString()
  const provider = providers[alert.program]
  if (!provider) {
    repository.saveEvaluation({
      alert,
      state: buildUnsupportedProviderState(alert, nowIso),
      run: buildUnsupportedProviderRun(alert, nowIso),
    })
    return
  }

  const searchedDates = expandAlertDates(alert)
  const priorState = repository.getState(alert.id)
  const searchOutcomes: SearchOutcome[] = []

  for (const departureDate of searchedDates) {
    try {
      const flights = await provider.search({ origin: alert.origin, destination: alert.destination, departureDate })
      searchOutcomes.push({ date: departureDate, flights })
    } catch (error) {
      searchOutcomes.push({ date: departureDate, error: error as Error })
    }
  }

  const successfulFlights = searchOutcomes
    .filter((outcome): outcome is SuccessfulSearchOutcome => "flights" in outcome)
    .flatMap((outcome) => outcome.flights)
  const scrapeErrors = searchOutcomes
    .filter((outcome): outcome is FailedSearchOutcome => "error" in outcome)
    .map((outcome) => outcome.error.message)

  const matchEvaluation = provider.evaluateMatches(alert, successfulFlights)
  const createNotification = matchEvaluation.hasMatch && (!priorState?.hasMatch || shouldNotifyAgain(alert, priorState, now))
  const preservePriorMatchState = scrapeErrors.length > 0 && !matchEvaluation.hasMatch && !!priorState?.hasMatch

  const state: AwardAlertState = {
    alertId: alert.id,
    hasMatch: preservePriorMatchState ? priorState.hasMatch : matchEvaluation.hasMatch,
    matchedDates: preservePriorMatchState ? priorState.matchedDates : matchEvaluation.matchedDates,
    matchingResults: preservePriorMatchState ? priorState.matchingResults : matchEvaluation.matchingResults,
    bestMatchSummary: preservePriorMatchState ? priorState.bestMatchSummary : matchEvaluation.bestMatchSummary,
    matchFingerprint: preservePriorMatchState ? priorState.matchFingerprint : matchEvaluation.matchFingerprint,
    lastMatchAt: preservePriorMatchState
      ? priorState.lastMatchAt
      : matchEvaluation.hasMatch
        ? nowIso
        : priorState?.lastMatchAt,
    lastNotifiedAt: priorState?.lastNotifiedAt,
    lastErrorAt: scrapeErrors.length > 0 ? nowIso : undefined,
    lastErrorMessage: scrapeErrors[0],
    updatedAt: nowIso,
  }

  const run: AwardAlertRun = {
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

  const event: NotificationEvent = {
    id: buildNotificationEventId(alert.id, matchEvaluation.matchFingerprint, priorState?.lastNotifiedAt),
    alertId: alert.id,
    userId: alert.userId,
    createdAt: nowIso,
    payload: {
      origin: alert.origin,
      destination: alert.destination,
      cabin: alert.cabin,
      matchedDates: matchEvaluation.matchedDates,
      matchCount: matchEvaluation.matchingResults.length,
      nonstopOnly: alert.nonstopOnly,
      maxMiles: alert.maxMiles,
      maxCash: alert.maxCash,
      bestMatch: matchEvaluation.bestMatchSummary,
      bookingUrl: matchEvaluation.bookingUrl,
    },
    status: "pending",
    sentAt: undefined,
    failureReason: undefined,
  }

  repository.createNotificationEvent(event)
  repository.saveEvaluation({
    alert,
    state: {
      ...state,
      lastNotifiedAt: nowIso,
    },
    run,
  })
}
