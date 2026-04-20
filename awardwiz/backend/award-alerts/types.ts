export type AwardProgram = string
export type AwardAlertDateMode = "single_date" | "date_range"
export type AwardAlertCabin = "economy" | "business" | "first"

type AwardAlertBase = {
  id: string
  program: AwardProgram
  userId: string
  origin: string
  destination: string
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

export type AwardAlert =
  | (AwardAlertBase & {
      dateMode: "single_date"
      date: string
      startDate?: never
      endDate?: never
    })
  | (AwardAlertBase & {
      dateMode: "date_range"
      date?: never
      startDate: string
      endDate: string
    })
