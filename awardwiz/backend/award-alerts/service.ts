import { expandAlertDates } from "./date-scope.js"
import { buildDefaultAwardAlertProviders } from "./providers/index.js"
import { createRawScraperSearchResolver, type RawScraperSearch } from "./raw-scraper-search.js"
import type {
  AwardAlert,
  AwardAlertMatchEvaluation,
  AwardAlertProviders,
  AwardAlertRun,
  AwardSearchQuery,
  AwardAlertState,
  NotificationEvent,
  RawScraperBatchInput,
  RawScraperBatchResult,
} from "./types.js"
import type { FlightWithFares } from "../../types/scrapers.js"
import {
  applyAlertPatch,
  buildAlertFromInput,
  type AwardAlertPatchInput,
  type AwardAlertWriteInput,
} from "./validation.js"

export type AwardAlertsRuntimeStatus = {
  databasePath?: string
  evaluator: { running: boolean, [key: string]: unknown }
  notifier: { running: boolean, [key: string]: unknown }
  [key: string]: unknown
}

export type AwardAlertsTriggerResult = {
  started: boolean
  reason?: string
}

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
  getRawScraperSearch?: (scraperName: string) => Promise<RawScraperSearch>
  now: () => Date
  generateId: () => string
  runtimeStatus: () => AwardAlertsRuntimeStatus
  runEvaluator: () => Promise<AwardAlertsTriggerResult>
  runNotifier: () => Promise<AwardAlertsTriggerResult>
}

const unsupportedProviderMessage = (program: string) => `unsupported award program: ${program}`

const assertSupportedProvider = (providers: AwardAlertProviders, program: string) => {
  const provider = providers[program]
  if (!provider)
    throw new Error(unsupportedProviderMessage(program))
  return provider
}

const searchProviderForPreview = async ({
  alert,
  providers,
}: {
  alert: AwardAlert
  providers: AwardAlertProviders
}): Promise<AwardAlertMatchEvaluation> => {
  const provider = assertSupportedProvider(providers, alert.program)

  const searchedDates = expandAlertDates(alert)
  const flights = (await Promise.all(searchedDates.map(departureDate =>
    provider.search({ origin: alert.origin, destination: alert.destination, departureDate })
  ))).flat() as FlightWithFares[]

  return provider.evaluateMatches(alert, flights)
}

const getRequestField = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`${field} must be a non-empty string`)
  return value.trim()
}

const normalizeAirportCode = (value: unknown, field: string) => {
  const normalized = getRequestField(value, field).toUpperCase()
  if (!/^[A-Z]{3}$/u.test(normalized))
    throw new Error(`${field} must be a 3-letter airport code`)
  return normalized
}

const normalizeDepartureDate = (value: unknown, field: string) => {
  const normalized = getRequestField(value, field)
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized))
    throw new Error(`${field} must be a YYYY-MM-DD date`)
  return normalized
}

const normalizeRawScraperBatchInput = (input: RawScraperBatchInput): RawScraperBatchInput => {
  const scraperName = getRequestField(input.scraperName, "scraperName").toLowerCase()
  if (!Array.isArray(input.items) || input.items.length === 0)
    throw new Error("items must be a non-empty array")

  const items = input.items.map((item, index): AwardSearchQuery => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error(`items[${index}] must be an object`)

    return {
      origin: normalizeAirportCode(item.origin, `items[${index}].origin`),
      destination: normalizeAirportCode(item.destination, `items[${index}].destination`),
      departureDate: normalizeDepartureDate(item.departureDate, `items[${index}].departureDate`),
    }
  })

  return {
    scraperName,
    items,
  }
}

export const createAwardAlertsService = ({
  repository,
  providers = buildDefaultAwardAlertProviders(),
  getRawScraperSearch = createRawScraperSearchResolver(),
  now,
  generateId,
  runtimeStatus,
  runEvaluator,
  runNotifier,
}: AwardAlertsServiceDependencies) => ({
  listAlerts: () => repository.listAlerts(),

  getAlert: (id: string) => repository.getAlert(id),

  async createAlert(input: AwardAlertWriteInput) {
    assertSupportedProvider(providers, input.program)
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
    const alert = buildAlertFromInput({
      input,
      now: now(),
      generateId: () => "__preview__",
    })
    return searchProviderForPreview({ alert, providers })
  },

  getAlertRuns: (alertId: string) => repository.listAlertRuns(alertId),

  getAlertNotifications: (alertId: string) => repository.listNotificationEvents(alertId),

  getStatus: () => runtimeStatus(),

  triggerEvaluatorRun: () => runEvaluator(),

  triggerNotifierRun: () => runNotifier(),

  async runScraperBatch(input: RawScraperBatchInput): Promise<RawScraperBatchResult> {
    const normalizedInput = normalizeRawScraperBatchInput(input)
    const search = await getRawScraperSearch(normalizedInput.scraperName)
    const results = await Promise.all(normalizedInput.items.map(async (item) => {
      try {
        return {
          ...item,
          ok: true as const,
          response: await search(item),
        }
      } catch (error) {
        return {
          ...item,
          ok: false as const,
          error: error instanceof Error ? error.message : "raw scraper request failed",
        }
      }
    }))

    return {
      scraperName: normalizedInput.scraperName,
      results,
    }
  },
})
