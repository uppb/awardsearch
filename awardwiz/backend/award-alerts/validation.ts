import type { AwardAlert, AwardAlertCabin, AwardProgram } from "./types.js"

const defaultPollIntervalMinutes = 1
const defaultMinNotificationIntervalMinutes = 10
const validDatePattern = /^\d{4}-\d{2}-\d{2}$/
const validCabins = new Set<AwardAlertCabin>(["economy", "business", "first"])

export type AwardAlertWriteInput = {
  program: AwardProgram
  userId?: string
  origin: string
  destination: string
  date?: string
  startDate?: string
  endDate?: string
  cabin: AwardAlertCabin
  nonstopOnly?: boolean
  maxMiles?: number
  maxCash?: number
  active?: boolean
  pollIntervalMinutes?: number
  minNotificationIntervalMinutes?: number
}

export type AwardAlertPatchInput = Partial<Omit<AwardAlertWriteInput, "program">> & {
  userId?: string | null
  maxMiles?: number | null
  maxCash?: number | null
}

export type AwardAlertPreviewAlert = {
  program: AwardProgram
  userId: string | undefined
  origin: string
  destination: string
  dateMode: AwardAlert["dateMode"]
  date?: string
  startDate?: string
  endDate?: string
  cabin: AwardAlertCabin
  nonstopOnly: boolean
  maxMiles: number | undefined
  maxCash: number | undefined
  active: boolean
  pollIntervalMinutes: number
  minNotificationIntervalMinutes: number
}

type DateSelection =
  | { dateMode: "single_date", date: string, startDate?: never, endDate?: never }
  | { dateMode: "date_range", date?: never, startDate: string, endDate: string }

type DateInput = {
  date?: string
  startDate?: string
  endDate?: string
}

type DateFallback = Pick<AwardAlert, "dateMode" | "date" | "startDate" | "endDate">

function assertNonEmptyString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0)
    throw new Error(`Invalid value for ${fieldName}`)
}

function assertOptionalBoolean(value: unknown, fieldName: string) {
  if (value !== undefined && typeof value !== "boolean")
    throw new Error(`Invalid boolean for ${fieldName}`)
}

function assertOptionalPositiveInteger(value: unknown, fieldName: string) {
  if (value === undefined)
    return

  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0)
    throw new Error(`Invalid positive integer for ${fieldName}: ${String(value)}`)
}

function assertOptionalNonNegativeInteger(value: unknown, fieldName: string) {
  if (value === undefined)
    return

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    throw new Error(`Invalid non-negative integer for ${fieldName}: ${String(value)}`)
}

function assertOptionalNonNegativeNumber(value: unknown, fieldName: string) {
  if (value === undefined)
    return

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`Invalid non-negative number for ${fieldName}: ${String(value)}`)
}

function assertCabin(value: unknown): asserts value is AwardAlertCabin {
  if (!validCabins.has(value as AwardAlertCabin))
    throw new Error(`Invalid cabin: ${String(value)}`)
}

function validateAlertInput(input: AwardAlertWriteInput) {
  assertNonEmptyString(input.program, "program")
  assertNonEmptyString(input.origin, "origin")
  assertNonEmptyString(input.destination, "destination")

  if (input.userId !== undefined)
    assertNonEmptyString(input.userId, "userId")

  assertCabin(input.cabin)
  assertOptionalBoolean(input.nonstopOnly, "nonstopOnly")
  assertOptionalBoolean(input.active, "active")
  assertOptionalPositiveInteger(input.pollIntervalMinutes, "pollIntervalMinutes")
  assertOptionalPositiveInteger(input.minNotificationIntervalMinutes, "minNotificationIntervalMinutes")
  assertOptionalNonNegativeInteger(input.maxMiles, "maxMiles")
  assertOptionalNonNegativeNumber(input.maxCash, "maxCash")
}

function assertDate(value: string, fieldName: string) {
  if (!validDatePattern.test(value))
    throw new Error(`Invalid date for ${fieldName}: ${value}`)

  const [yearPart, monthPart, dayPart] = value.split("-")
  const year = Number.parseInt(yearPart ?? "", 10)
  const month = Number.parseInt(monthPart ?? "", 10)
  const day = Number.parseInt(dayPart ?? "", 10)
  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date for ${fieldName}: ${value}`)
  }
}

function resolveDateSelection(input: DateInput, fallback?: DateFallback): DateSelection {
  const hasSingleDate = typeof input.date === "string"
  const hasStartDate = typeof input.startDate === "string"
  const hasEndDate = typeof input.endDate === "string"

  if (hasSingleDate) {
    if (hasStartDate || hasEndDate)
      throw new Error("Use either date or startDate/endDate")

    assertDate(input.date, "date")
    return {
      dateMode: "single_date",
      date: input.date,
    }
  }

  if (hasStartDate || hasEndDate) {
    if (!hasStartDate || !hasEndDate)
      throw new Error("startDate and endDate are both required for date-range alerts")

    assertDate(input.startDate, "startDate")
    assertDate(input.endDate, "endDate")
    if (input.startDate > input.endDate)
      throw new Error("startDate must be on or before endDate")

    return {
      dateMode: "date_range",
      startDate: input.startDate,
      endDate: input.endDate,
    }
  }

  if (!fallback)
    throw new Error("Alert input requires date or startDate/endDate")

  return fallback.dateMode === "single_date"
    ? {
        dateMode: "single_date",
        date: fallback.date!,
      }
    : {
        dateMode: "date_range",
        startDate: fallback.startDate!,
        endDate: fallback.endDate!,
      }
}

function mergeClearableField<T>(value: T | null | undefined, currentValue: T | undefined): T | undefined {
  if (value === undefined)
    return currentValue

  return value === null ? undefined : value
}

function buildCommonAlertFields(input: AwardAlertWriteInput, fallback?: DateFallback) {
  validateAlertInput(input)
  const dateSelection = resolveDateSelection(input, fallback)

  return {
    program: input.program,
    userId: input.userId,
    origin: input.origin,
    destination: input.destination,
    cabin: input.cabin,
    nonstopOnly: input.nonstopOnly ?? false,
    maxMiles: input.maxMiles,
    maxCash: input.maxCash,
    active: input.active ?? true,
    pollIntervalMinutes: input.pollIntervalMinutes ?? defaultPollIntervalMinutes,
    minNotificationIntervalMinutes: input.minNotificationIntervalMinutes ?? defaultMinNotificationIntervalMinutes,
    ...dateSelection,
  }
}

export function buildAlertFromInput({
  input,
  now,
  generateId,
}: {
  input: AwardAlertWriteInput
  now: Date
  generateId: () => string
}): AwardAlert {
  const nowIso = now.toISOString()
  const common = buildCommonAlertFields(input)

  return {
    id: generateId(),
    ...common,
    lastCheckedAt: undefined,
    nextCheckAt: common.active ? nowIso : undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
}

export function applyAlertPatch(alert: AwardAlert, patch: AwardAlertPatchInput, now: Date): AwardAlert {
  const nowIso = now.toISOString()
  const mergedInput: AwardAlertWriteInput = {
    program: alert.program,
    userId: mergeClearableField(patch.userId, alert.userId),
    origin: patch.origin ?? alert.origin,
    destination: patch.destination ?? alert.destination,
    date: patch.date,
    startDate: patch.startDate,
    endDate: patch.endDate,
    cabin: patch.cabin ?? alert.cabin,
    nonstopOnly: patch.nonstopOnly ?? alert.nonstopOnly,
    maxMiles: mergeClearableField(patch.maxMiles, alert.maxMiles),
    maxCash: mergeClearableField(patch.maxCash, alert.maxCash),
    active: patch.active ?? alert.active,
    pollIntervalMinutes: patch.pollIntervalMinutes ?? alert.pollIntervalMinutes,
    minNotificationIntervalMinutes: patch.minNotificationIntervalMinutes ?? alert.minNotificationIntervalMinutes,
  }

  const dateSelection = resolveDateSelection(
    {
      date: patch.date,
      startDate: patch.startDate,
      endDate: patch.endDate,
    },
    {
      dateMode: alert.dateMode,
      date: "date" in alert ? alert.date : undefined,
      startDate: "startDate" in alert ? alert.startDate : undefined,
      endDate: "endDate" in alert ? alert.endDate : undefined,
    },
  )

  const active = mergedInput.active ?? alert.active

  return {
    id: alert.id,
    program: alert.program,
    userId: mergedInput.userId,
    origin: mergedInput.origin,
    destination: mergedInput.destination,
    cabin: mergedInput.cabin,
    nonstopOnly: mergedInput.nonstopOnly ?? false,
    maxMiles: mergedInput.maxMiles,
    maxCash: mergedInput.maxCash,
    active,
    pollIntervalMinutes: mergedInput.pollIntervalMinutes ?? defaultPollIntervalMinutes,
    minNotificationIntervalMinutes: mergedInput.minNotificationIntervalMinutes ?? defaultMinNotificationIntervalMinutes,
    lastCheckedAt: alert.lastCheckedAt,
    nextCheckAt: patch.active === false
      ? undefined
      : patch.active === true && alert.active === false
        ? nowIso
        : alert.nextCheckAt,
    createdAt: alert.createdAt,
    updatedAt: nowIso,
    ...dateSelection,
  }
}

export function buildPreviewAlertFromInput(input: AwardAlertWriteInput): AwardAlertPreviewAlert {
  return buildCommonAlertFields(input)
}
