import dayjs from "dayjs"
import type { AwardAlert } from "./types.js"

export const expandAlertDates = (alert: AwardAlert): string[] => {
  if (alert.dateMode === "single_date")
    return [alert.date!]

  const dates: string[] = []
  let current = dayjs(alert.startDate)
  const end = dayjs(alert.endDate)

  while (current.isBefore(end) || current.isSame(end, "day")) {
    dates.push(current.format("YYYY-MM-DD"))
    current = current.add(1, "day")
  }

  return dates
}
