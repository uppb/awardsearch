import { expandAlertDates } from "./date-scope.js"
import { buildDefaultAwardAlertProviders } from "./providers/index.js"
import type {
  AwardAlert,
  AwardAlertMatchEvaluation,
  AwardAlertProviders,
  AwardAlertRun,
  AwardAlertState,
  NotificationEvent,
} from "./types.js"
import type { FlightWithFares } from "../../types/scrapers.js"
import {
  applyAlertPatch,
  buildAlertFromInput,
  buildPreviewAlertFromInput,
  type AwardAlertPatchInput,
  type AwardAlertWriteInput,
} from "./validation.js"

export type AwardAlertsRuntimeStatus = {
  databasePath?: string
  evaluator: { running: boolean } & Record<string, unknown>
  notifier: { running: boolean } & Record<string, unknown>
} & Record<string, unknown>

export type AwardAlertsServiceRepository = {
  listAlerts: () => AwardAlert[]
  getAlert: (id: string) => AwardAlert | undefined
  insertAlert: (alert: AwardAlert) => void
  updateAlert: (alert: AwardAlert) => void
  pauseAlert: (id: string, updatedAt: string) => void
  resumeAlert: (id: string, updatedAt: string) => void
  deleteAlert: (id: string) => void
  listAlertRuns: (alertId: string) => AwardAlertRun[]
  listNotificationEvents: (alertId: string) => NotificationEvent[]
  getState?: (alertId: string) => AwardAlertState | undefined
}

export type AwardAlertsServiceDependencies = {
  repository: AwardAlertsServiceRepository
  providers?: AwardAlertProviders
  now: () => Date
  generateId: () => string
  runtimeStatus: () => AwardAlertsRuntimeStatus
  runEvaluator: () => Promise<unknown>
  runNotifier: () => Promise<unknown>
}

const unsupportedProviderMessage = (program: string) => `unsupported award program: ${program}`

const searchProviderForPreview = async ({
  alert,
  providers,
}: {
  alert: ReturnType<typeof buildPreviewAlertFromInput>
  providers: AwardAlertProviders
}): Promise<AwardAlertMatchEvaluation> => {
  const provider = providers[alert.program]
  if (!provider)
    throw new Error(unsupportedProviderMessage(alert.program))

  const searchedDates = expandAlertDates(alert)
  const flights: FlightWithFares[] = []
  for (const departureDate of searchedDates)
    flights.push(...await provider.search({ origin: alert.origin, destination: alert.destination, departureDate }))

  return provider.evaluateMatches(alert as unknown as AwardAlert, flights)
}

export const createAwardAlertsService = ({
  repository,
  providers = buildDefaultAwardAlertProviders(),
  now,
  generateId,
  runtimeStatus,
  runEvaluator,
  runNotifier,
}: AwardAlertsServiceDependencies) => ({
  listAlerts: () => repository.listAlerts(),

  getAlert: (id: string) => repository.getAlert(id),

  async createAlert(input: AwardAlertWriteInput) {
    const alert = buildAlertFromInput({ input, now: now(), generateId })
    repository.insertAlert(alert)
    return alert
  },

  async updateAlert(id: string, patch: AwardAlertPatchInput) {
    const current = repository.getAlert(id)
    if (!current)
      throw new Error(`award alert not found: ${id}`)

    const updated = applyAlertPatch(current, patch, now())
    repository.updateAlert(updated)
    return updated
  },

  async pauseAlert(id: string) {
    const current = repository.getAlert(id)
    if (!current)
      throw new Error(`award alert not found: ${id}`)

    repository.pauseAlert(id, now().toISOString())
    return repository.getAlert(id) ?? current
  },

  async resumeAlert(id: string) {
    const current = repository.getAlert(id)
    if (!current)
      throw new Error(`award alert not found: ${id}`)

    repository.resumeAlert(id, now().toISOString())
    return repository.getAlert(id) ?? current
  },

  async deleteAlert(id: string) {
    const current = repository.getAlert(id)
    if (!current)
      throw new Error(`award alert not found: ${id}`)

    repository.deleteAlert(id)
    return current
  },

  async previewAlert(input: AwardAlertWriteInput) {
    const alert = buildPreviewAlertFromInput(input)
    return searchProviderForPreview({ alert, providers })
  },

  getAlertRuns: (alertId: string) => repository.listAlertRuns(alertId),

  getAlertNotifications: (alertId: string) => repository.listNotificationEvents(alertId),

  getStatus: () => runtimeStatus(),

  triggerEvaluatorRun: () => runEvaluator(),

  triggerNotifierRun: () => runNotifier(),
})
