import { createHash, randomUUID } from "node:crypto"
import { expandAlertDates } from "./date-scope.js"
import { evaluateAlertMatches, shouldNotifyAgain } from "./matcher.js"
import type { AlaskaAlert, AlaskaAlertRun, AlaskaAlertState, AlaskaSearch, NotificationEvent } from "./types.js"

export type AlertRepository = {
  getState: (alertId: string) => Promise<AlaskaAlertState | undefined>
  saveEvaluation: (evaluation: { state: AlaskaAlertState, run: AlaskaAlertRun }) => Promise<void>
  createNotificationEvent: (event: NotificationEvent) => Promise<void>
}

type EvaluateOneAlertArgs = {
  alert: AlaskaAlert
  repository: AlertRepository
  searchAlaska: AlaskaSearch
  now: Date
}

const buildNotificationEventId = (alertId: string, matchFingerprint: string, lastNotifiedAt: string | undefined) =>
  `notify-${createHash("sha1")
    .update(JSON.stringify({ alertId, matchFingerprint, lastNotifiedAt: lastNotifiedAt ?? null }))
    .digest("hex")}`

export const evaluateOneAlert = async ({ alert, repository, searchAlaska, now }: EvaluateOneAlertArgs) => {
  const nowIso = now.toISOString()
  const searchedDates = expandAlertDates(alert)
  const priorState = await repository.getState(alert.id)
  const flights = []
  for (const departureDate of searchedDates)
    flights.push(...await searchAlaska({ origin: alert.origin, destination: alert.destination, departureDate }))

  const matchEvaluation = evaluateAlertMatches(alert, flights)
  const createNotification = matchEvaluation.hasMatch && (!priorState?.hasMatch || shouldNotifyAgain(alert, priorState, now))

  const state: AlaskaAlertState = {
    alertId: alert.id,
    hasMatch: matchEvaluation.hasMatch,
    matchedDates: matchEvaluation.matchedDates,
    matchingResults: matchEvaluation.matchingResults,
    bestMatchSummary: matchEvaluation.bestMatchSummary,
    matchFingerprint: matchEvaluation.matchFingerprint,
    lastMatchAt: matchEvaluation.hasMatch ? nowIso : priorState?.lastMatchAt,
    lastNotifiedAt: priorState?.lastNotifiedAt,
    lastErrorAt: undefined,
    lastErrorMessage: undefined,
    updatedAt: nowIso,
  }

  const run: AlaskaAlertRun = {
    id: randomUUID(),
    alertId: alert.id,
    startedAt: nowIso,
    completedAt: nowIso,
    searchedDates,
    scrapeCount: searchedDates.length,
    scrapeSuccessCount: searchedDates.length,
    scrapeErrorCount: 0,
    matchedResultCount: matchEvaluation.matchingResults.length,
    hasMatch: matchEvaluation.hasMatch,
    errorSummary: undefined,
  }

  if (!createNotification)
    return repository.saveEvaluation({ state, run })

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
      bestMatch: matchEvaluation.bestMatchSummary,
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
