import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat.js"
import type { AwardAlert } from "./types.js"

dayjs.extend(customParseFormat)

const DATE_FORMAT = "YYYY-MM-DD"

const requireDate = (value: string | undefined, fieldName: string) => {
  if (!value)
    throw new Error(`award alert ${fieldName} is required`)

  const parsed = dayjs(value, DATE_FORMAT, true)
  if (!parsed.isValid())
    throw new Error(`award alert ${fieldName} is invalid: ${value}`)

  return parsed
}

export const expandAlertDates = (alert: AwardAlert): string[] => {
  if (alert.dateMode === "single_date")
    return [requireDate(alert.date, "date").format(DATE_FORMAT)]

  const dates: string[] = []
  let current = requireDate(alert.startDate, "startDate")
  const end = requireDate(alert.endDate, "endDate")

  if (current.isAfter(end, "day"))
    throw new Error("award alert startDate must be on or before endDate")

  while (current.isBefore(end) || current.isSame(end, "day")) {
    dates.push(current.format(DATE_FORMAT))
    current = current.add(1, "day")
  }

  return dates
}
