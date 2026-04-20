export type AwardProgram = string
export type AwardAlertDateMode = "single_date" | "date_range"
export type AwardAlertCabin = "economy" | "business" | "first"

export type AwardAlert = {
  id: string
  program: AwardProgram
  userId: string
  origin: string
  destination: string
  dateMode: AwardAlertDateMode
  date: string | undefined
  startDate: string | undefined
  endDate: string | undefined
  cabin: AwardAlertCabin
  nonstopOnly: boolean
  maxMiles: number | undefined
  maxCash: number | undefined
  active: boolean
  pollIntervalMinutes: number
  minNotificationIntervalMinutes: number
  lastCheckedAt: string | undefined
  nextCheckAt: string | undefined
  createdAt: string
  updatedAt: string
}
