import { describe, expect, it } from "vitest"
import { expandAlertDates } from "../../../awardwiz/backend/award-alerts/date-scope.js"
import type { AwardAlert } from "../../../awardwiz/backend/award-alerts/types.js"

const baseAlert: AwardAlert = {
  id: "alert-1",
  program: "alaska",
  userId: "user-1",
  origin: "SFO",
  destination: "HNL",
  dateMode: "single_date",
  date: "2026-07-01",
  startDate: undefined,
  endDate: undefined,
  cabin: "business",
  nonstopOnly: true,
  maxMiles: undefined,
  maxCash: undefined,
  active: true,
  pollIntervalMinutes: 30,
  minNotificationIntervalMinutes: 60,
  lastCheckedAt: undefined,
  nextCheckAt: "2026-04-19T00:00:00.000Z",
  createdAt: "2026-04-19T00:00:00.000Z",
  updatedAt: "2026-04-19T00:00:00.000Z",
}

describe("expandAlertDates", () => {
  it("returns one date for single_date alerts", () => {
    expect(expandAlertDates(baseAlert)).toEqual(["2026-07-01"])
  })

  it("expands every date in a date range", () => {
    expect(expandAlertDates({
      ...baseAlert,
      dateMode: "date_range",
      date: undefined,
      startDate: "2026-07-01",
      endDate: "2026-07-03",
    })).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"])
  })
})
