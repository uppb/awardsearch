import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"
import type { AwardAlert, AwardAlertCabin } from "./types.js"
import { openAwardAlertsDb } from "./sqlite.js"
import { SqliteAwardAlertsRepository } from "./sqlite-repository.js"

type CliRepository = Pick<SqliteAwardAlertsRepository,
  "deleteAlert" | "getAlert" | "getState" | "insertAlert" | "listAlerts" | "pauseAlert" | "resumeAlert"
>

export type AwardAlertsCliDeps = {
  openRepository?: () => { repository: CliRepository, close: () => void }
  stdout?: (line: string) => void
  stderr?: (line: string) => void
  now?: () => Date
  generateId?: () => string
}

const defaultDatabasePath = "./tmp/award-alerts.sqlite"
const defaultPollIntervalMinutes = 30
const defaultMinNotificationIntervalMinutes = 60
const validDatePattern = /^\d{4}-\d{2}-\d{2}$/
const nonNegativeIntegerPattern = /^(0|[1-9]\d*)$/
const nonNegativeNumberPattern = /^(0|[1-9]\d*)(\.\d+)?$/
const validCabins = new Set<AwardAlertCabin>(["economy", "business", "first"])
const createFlags = new Set([
  "--program",
  "--user-id",
  "--origin",
  "--destination",
  "--date",
  "--start-date",
  "--end-date",
  "--cabin",
  "--nonstop-only",
  "--max-miles",
  "--max-cash",
  "--poll-interval-minutes",
  "--min-notification-interval-minutes",
])

const defaultCliDeps: Required<AwardAlertsCliDeps> = {
  openRepository: () => {
    const db = openAwardAlertsDb(process.env["DATABASE_PATH"] ?? defaultDatabasePath)
    return {
      repository: new SqliteAwardAlertsRepository(db),
      close: () => db.close(),
    }
  },
  stdout: line => console.log(line),
  stderr: line => console.error(line),
  now: () => new Date(),
  generateId: () => randomUUID(),
}

type ParsedOptions = Map<string, string | true>

const isFlag = (value: string) => value.startsWith("--")

function parseOptions(argv: string[], allowedFlags: Set<string>): ParsedOptions {
  const options = new Map<string, string | true>()

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === undefined)
      throw new Error("Unexpected missing argument")

    if (!isFlag(token))
      throw new Error(`Unexpected argument: ${token}`)

    if (!allowedFlags.has(token))
      throw new Error(`Unknown option: ${token}`)

    if (token === "--nonstop-only") {
      options.set(token, true)
      continue
    }

    const next = argv[index + 1]
    if (next === undefined || isFlag(next))
      throw new Error(`Missing value for ${token}`)

    options.set(token, next)
    index += 1
  }

  return options
}

function requireOption(options: ParsedOptions, name: string): string {
  const value = options.get(name)
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Missing required option: ${name}`)
  return value
}

function requiredPositiveInteger(options: ParsedOptions, name: string, fallback?: number): number {
  const value = options.get(name)
  if (value === undefined) {
    if (fallback !== undefined)
      return fallback
    throw new Error(`Missing required option: ${name}`)
  }

  if (typeof value !== "string")
    throw new Error(`Expected integer value for ${name}`)

  if (!nonNegativeIntegerPattern.test(value))
    throw new Error(`Invalid positive integer for ${name}: ${value}`)

  const parsed = Number.parseInt(value, 10)
  if (parsed <= 0)
    throw new Error(`Invalid positive integer for ${name}: ${value}`)

  return parsed
}

function assertDate(value: string, optionName: string) {
  if (!validDatePattern.test(value))
    throw new Error(`Invalid date for ${optionName}: ${value}`)

  const parts = value.split("-")
  if (parts.length !== 3)
    throw new Error(`Invalid date for ${optionName}: ${value}`)

  const yearPart = parts[0]!
  const monthPart = parts[1]!
  const dayPart = parts[2]!
  const year = Number.parseInt(yearPart, 10)
  const month = Number.parseInt(monthPart, 10)
  const day = Number.parseInt(dayPart, 10)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date for ${optionName}: ${value}`)
  }
}

function optionalNonNegativeInteger(options: ParsedOptions, name: string): number | undefined {
  const value = options.get(name)
  if (value === undefined)
    return undefined
  if (typeof value !== "string" || !nonNegativeIntegerPattern.test(value))
    throw new Error(`Invalid non-negative integer for ${name}: ${String(value)}`)

  return Number.parseInt(value, 10)
}

function optionalNonNegativeNumber(options: ParsedOptions, name: string): number | undefined {
  const value = options.get(name)
  if (value === undefined)
    return undefined
  if (typeof value !== "string" || !nonNegativeNumberPattern.test(value))
    throw new Error(`Invalid non-negative number for ${name}: ${String(value)}`)

  return Number(value)
}

function parseCabin(value: string): AwardAlertCabin {
  if (!validCabins.has(value as AwardAlertCabin))
    throw new Error(`Invalid cabin: ${value}`)
  return value as AwardAlertCabin
}

function formatDates(alert: AwardAlert): string {
  return alert.dateMode === "single_date" ? alert.date : `${alert.startDate}..${alert.endDate}`
}

function formatList(alerts: AwardAlert[]): string[] {
  if (alerts.length === 0)
    return ["No alerts found"]

  return [
    "ID | Program | User | Route | Dates | Cabin | Status",
    ...alerts.map(alert => [
      alert.id,
      alert.program,
      alert.userId,
      `${alert.origin}-${alert.destination}`,
      formatDates(alert),
      alert.cabin,
      alert.active ? "active" : "paused",
    ].join(" | ")),
  ]
}

function formatShow(alert: AwardAlert, state?: ReturnType<CliRepository["getState"]>): string[] {
  const lines = [
    `id: ${alert.id}`,
    `program: ${alert.program}`,
    `user: ${alert.userId}`,
    `route: ${alert.origin}-${alert.destination}`,
    `dates: ${alert.dateMode} ${formatDates(alert)}`,
    `cabin: ${alert.cabin}`,
    `status: ${alert.active ? "active" : "paused"}`,
    `nonstop_only: ${alert.nonstopOnly ? "yes" : "no"}`,
    `max_miles: ${alert.maxMiles ?? "-"}`,
    `max_cash: ${alert.maxCash ?? "-"}`,
    `poll_interval_minutes: ${alert.pollIntervalMinutes}`,
    `min_notification_interval_minutes: ${alert.minNotificationIntervalMinutes}`,
    `created_at: ${alert.createdAt}`,
    `updated_at: ${alert.updatedAt}`,
  ]

  if (state === undefined)
    return [...lines, "state: no evaluation yet"]

  return [
    ...lines,
    `state.has_match: ${state.hasMatch ? "yes" : "no"}`,
    `state.last_match_at: ${state.lastMatchAt ?? "-"}`,
    `state.last_notified_at: ${state.lastNotifiedAt ?? "-"}`,
    `state.last_error_at: ${state.lastErrorAt ?? "-"}`,
    `state.last_error_message: ${state.lastErrorMessage ?? "-"}`,
  ]
}

function createAlertFromArgs(argv: string[], deps: Required<AwardAlertsCliDeps>): AwardAlert {
  const options = parseOptions(argv, createFlags)
  const nowIso = deps.now().toISOString()
  const program = requireOption(options, "--program")
  const userId = requireOption(options, "--user-id")
  const origin = requireOption(options, "--origin")
  const destination = requireOption(options, "--destination")
  const cabin = parseCabin(requireOption(options, "--cabin"))
  const pollIntervalMinutes = requiredPositiveInteger(options, "--poll-interval-minutes", defaultPollIntervalMinutes)
  const minNotificationIntervalMinutes = requiredPositiveInteger(
    options,
    "--min-notification-interval-minutes",
    defaultMinNotificationIntervalMinutes,
  )
  const maxMiles = optionalNonNegativeInteger(options, "--max-miles")
  const maxCash = optionalNonNegativeNumber(options, "--max-cash")
  const date = options.get("--date")
  const startDate = options.get("--start-date")
  const endDate = options.get("--end-date")

  if (typeof date === "string") {
    if (startDate !== undefined || endDate !== undefined)
      throw new Error("Use either --date or --start-date/--end-date")

    assertDate(date, "--date")
    return {
      id: deps.generateId(),
      program,
      userId,
      origin,
      destination,
      dateMode: "single_date",
      date,
      cabin,
      nonstopOnly: options.get("--nonstop-only") === true,
      maxMiles,
      maxCash,
      active: true,
      pollIntervalMinutes,
      minNotificationIntervalMinutes,
      lastCheckedAt: undefined,
      nextCheckAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
  }

  if (typeof startDate !== "string" || typeof endDate !== "string")
    throw new Error("Create requires --date or both --start-date and --end-date")

  assertDate(startDate, "--start-date")
  assertDate(endDate, "--end-date")
  if (startDate > endDate)
    throw new Error("--start-date must be on or before --end-date")

  return {
    id: deps.generateId(),
    program,
    userId,
    origin,
    destination,
    dateMode: "date_range",
    startDate,
    endDate,
    cabin,
    nonstopOnly: options.get("--nonstop-only") === true,
    maxMiles,
    maxCash,
    active: true,
    pollIntervalMinutes,
    minNotificationIntervalMinutes,
    lastCheckedAt: undefined,
    nextCheckAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

export async function runCli(argv: string[], deps: AwardAlertsCliDeps = {}): Promise<number> {
  const resolvedDeps = {
    ...defaultCliDeps,
    ...deps,
  }
  const [command, ...rest] = argv

  try {
    if (command === undefined)
      throw new Error("Missing command")

    const { repository, close } = resolvedDeps.openRepository()
    try {
      if (command === "create") {
        const alert = createAlertFromArgs(rest, resolvedDeps)
        repository.insertAlert(alert)
        resolvedDeps.stdout(`Created alert ${alert.id}`)
        return 0
      }

      if (command === "list") {
        if (rest.length > 0)
          throw new Error("Command list does not accept positional arguments")

        for (const line of formatList(repository.listAlerts()))
          resolvedDeps.stdout(line)
        return 0
      }

      if (command === "show") {
        if (rest.length !== 1)
          throw new Error(rest.length === 0 ? "Missing id for show" : "Command show accepts exactly one id")

        const id = rest[0]!
        const alert = repository.getAlert(id)
        if (alert === undefined)
          throw new Error(`award alert not found: ${id}`)

        for (const line of formatShow(alert, repository.getState(id)))
          resolvedDeps.stdout(line)
        return 0
      }

      if (command === "pause") {
        if (rest.length !== 1)
          throw new Error(rest.length === 0 ? "Missing id for pause" : "Command pause accepts exactly one id")

        const id = rest[0]!
        repository.pauseAlert(id, resolvedDeps.now().toISOString())
        resolvedDeps.stdout(`Paused alert ${id}`)
        return 0
      }

      if (command === "resume") {
        if (rest.length !== 1)
          throw new Error(rest.length === 0 ? "Missing id for resume" : "Command resume accepts exactly one id")

        const id = rest[0]!
        repository.resumeAlert(id, resolvedDeps.now().toISOString())
        resolvedDeps.stdout(`Resumed alert ${id}`)
        return 0
      }

      if (command === "delete") {
        if (rest.length !== 1)
          throw new Error(rest.length === 0 ? "Missing id for delete" : "Command delete accepts exactly one id")

        const id = rest[0]!
        repository.deleteAlert(id)
        resolvedDeps.stdout(`Deleted alert ${id}`)
        return 0
      }

      throw new Error(`Unsupported command: ${command}`)
    } finally {
      close()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    resolvedDeps.stderr(message)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runCli(process.argv.slice(2)).then(code => { process.exitCode = code })
