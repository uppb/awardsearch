import { describe, expect, it } from "vitest"
import { expandAlertDates } from "../../../awardwiz/backend/award-alerts/date-scope.js"
import type { AwardAlert } from "../../../awardwiz/backend/award-alerts/types.js"

const singleDateAlert = {
  id: "alert-1",
  program: "any-provider",
  userId: "user-1",
  origin: "SFO",
  destination: "HNL",
  dateMode: "single_date",
  date: "2026-07-01",
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
} satisfies AwardAlert

const dateRangeAlert = {
  id: "alert-2",
  program: "any-provider",
  userId: "user-1",
  origin: "SFO",
  destination: "HNL",
  dateMode: "date_range",
  startDate: "2026-07-01",
  endDate: "2026-07-03",
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
} satisfies AwardAlert

// @ts-expect-error single_date alerts must not accept startDate/endDate
const invalidSingleDateAlert: AwardAlert = {
  ...singleDateAlert,
  startDate: "2026-07-01",
  endDate: "2026-07-03",
}

// @ts-expect-error date_range alerts must not accept date
const invalidDateRangeAlert: AwardAlert = {
  ...dateRangeAlert,
  date: "2026-07-01",
}

describe("expandAlertDates", () => {
  it("returns one date for single_date alerts", () => {
    expect(expandAlertDates(singleDateAlert)).toEqual(["2026-07-01"])
  })

  it("expands every date in a date range", () => {
    expect(expandAlertDates(dateRangeAlert)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"])
  })

  it("throws when a single_date alert is missing a date", () => {
    expect(() => expandAlertDates({
      ...singleDateAlert,
      date: undefined,
    } as unknown as AwardAlert)).toThrow("award alert date is required")
  })

  it("throws when a date_range alert is missing a start date", () => {
    expect(() => expandAlertDates({
      ...dateRangeAlert,
      dateMode: "date_range",
      startDate: undefined,
      endDate: "2026-07-03",
    } as unknown as AwardAlert)).toThrow("award alert startDate is required")
  })

  it("throws when a date_range alert is missing an end date", () => {
    expect(() => expandAlertDates({
      ...dateRangeAlert,
      dateMode: "date_range",
      startDate: "2026-07-01",
      endDate: undefined,
    } as unknown as AwardAlert)).toThrow("award alert endDate is required")
  })

  it("throws when a date range starts after it ends", () => {
    expect(() => expandAlertDates({
      ...dateRangeAlert,
      dateMode: "date_range",
      startDate: "2026-07-03",
      endDate: "2026-07-01",
    } as unknown as AwardAlert)).toThrow("award alert startDate must be on or before endDate")
  })

  it("throws when a single_date alert has a malformed date", () => {
    expect(() => expandAlertDates({
      ...singleDateAlert,
      date: "2026-02-30",
    } as unknown as AwardAlert)).toThrow("award alert date is invalid: 2026-02-30")
  })

  it("throws when a date_range alert has a malformed date", () => {
    expect(() => expandAlertDates({
      ...dateRangeAlert,
      startDate: "2026-07-01",
      endDate: "2026-02-30",
    } as unknown as AwardAlert)).toThrow("award alert endDate is invalid: 2026-02-30")
  })
})
