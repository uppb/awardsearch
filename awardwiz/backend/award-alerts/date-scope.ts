import dayjs from "dayjs"
import type { AwardAlert } from "./types.js"

const requireDate = (value: string | undefined, fieldName: string) => {
  if (!value)
    throw new Error(`award alert ${fieldName} is required`)

  const parsed = dayjs(value)
  if (!parsed.isValid())
    throw new Error(`award alert ${fieldName} is invalid: ${value}`)

  return parsed
}

export const expandAlertDates = (alert: AwardAlert): string[] => {
  if (alert.dateMode === "single_date")
    return [requireDate(alert.date, "date").format("YYYY-MM-DD")]

  const dates: string[] = []
  let current = requireDate(alert.startDate, "startDate")
  const end = requireDate(alert.endDate, "endDate")

  if (current.isAfter(end, "day"))
    throw new Error("award alert startDate must be on or before endDate")

  while (current.isBefore(end) || current.isSame(end, "day")) {
    dates.push(current.format("YYYY-MM-DD"))
    current = current.add(1, "day")
  }

  return dates
}
