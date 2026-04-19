import dayjs from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat.js"
import utc from "dayjs/plugin/utc.js"
import type { AlaskaAlert } from "./types.js"

dayjs.extend(utc)
dayjs.extend(customParseFormat)

const MAX_RANGE_DAYS = 14
const DATE_FORMAT = "YYYY-MM-DD"

const parseAlertDate = (date: string) => dayjs.utc(date, DATE_FORMAT, true)

export const expandAlertDates = (alert: AlaskaAlert): string[] => {
  if (alert.dateMode === "single_date") {
    if (!alert.date) throw new Error("Missing date for single-date alert")
    if (!parseAlertDate(alert.date).isValid()) throw new Error("Invalid single-date alert date")
    return [alert.date]
  }

  if (!alert.startDate || !alert.endDate) throw new Error("Missing startDate/endDate for date-range alert")

  const start = parseAlertDate(alert.startDate)
  const end = parseAlertDate(alert.endDate)
  if (!start.isValid() || !end.isValid()) throw new Error("Alert date range is invalid")
  const diff = end.diff(start, "day")

  if (diff < 0) throw new Error("Alert date range is invalid")
  if (diff + 1 > MAX_RANGE_DAYS) throw new Error("Alert date range exceeds 14 days")

  return Array.from({ length: diff + 1 }, (_, index) => start.add(index, "day").format("YYYY-MM-DD"))
}
