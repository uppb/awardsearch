import { describe, expect, it } from "vitest"
import { expandAlertDates } from "../../../awardwiz/backend/alaska-alerts/date-scope.js"
import { AlaskaAlert } from "../../../awardwiz/backend/alaska-alerts/types.js"

describe("expandAlertDates", () => {
  it("returns the single date for a single-date alert", () => {
    const alert: AlaskaAlert = {
      id: "alert-1",
      userId: "user-1",
      origin: "SFO",
      destination: "HNL",
      dateMode: "single_date",
      date: "2026-07-01",
      startDate: undefined,
      endDate: undefined,
      cabin: "business",
      nonstopOnly: true,
      maxMiles: 45000,
      maxCash: 50,
      active: true,
      pollIntervalMinutes: 60,
      minNotificationIntervalMinutes: 180,
      lastCheckedAt: undefined,
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    }

    expect(expandAlertDates(alert)).toEqual(["2026-07-01"])
  })

  it("returns each date in an inclusive range", () => {
    const alert: AlaskaAlert = {
      id: "alert-2",
      userId: "user-1",
      origin: "SFO",
      destination: "HNL",
      dateMode: "date_range",
      date: undefined,
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      cabin: "economy",
      nonstopOnly: false,
      maxMiles: undefined,
      maxCash: 50,
      active: true,
      pollIntervalMinutes: 60,
      minNotificationIntervalMinutes: 180,
      lastCheckedAt: undefined,
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    }

    expect(expandAlertDates(alert)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"])
  })

  it("throws when a range exceeds fourteen days", () => {
    const alert: AlaskaAlert = {
      id: "alert-3",
      userId: "user-1",
      origin: "SFO",
      destination: "HNL",
      dateMode: "date_range",
      date: undefined,
      startDate: "2026-07-01",
      endDate: "2026-07-20",
      cabin: "economy",
      nonstopOnly: false,
      maxMiles: undefined,
      maxCash: undefined,
      active: true,
      pollIntervalMinutes: 60,
      minNotificationIntervalMinutes: 180,
      lastCheckedAt: undefined,
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    }

    expect(() => expandAlertDates(alert)).toThrow("Alert date range exceeds 14 days")
  })

  it("throws when a range ends before it starts", () => {
    const alert: AlaskaAlert = {
      id: "alert-4",
      userId: "user-1",
      origin: "SFO",
      destination: "HNL",
      dateMode: "date_range",
      date: undefined,
      startDate: "2026-07-03",
      endDate: "2026-07-01",
      cabin: "economy",
      nonstopOnly: false,
      maxMiles: undefined,
      maxCash: undefined,
      active: true,
      pollIntervalMinutes: 60,
      minNotificationIntervalMinutes: 180,
      lastCheckedAt: undefined,
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    }

    expect(() => expandAlertDates(alert)).toThrow("Alert date range is invalid")
  })

  it("throws when a range contains a malformed date", () => {
    const alert: AlaskaAlert = {
      id: "alert-5",
      userId: "user-1",
      origin: "SFO",
      destination: "HNL",
      dateMode: "date_range",
      date: undefined,
      startDate: "2026-07-01",
      endDate: "2026-07-0X",
      cabin: "economy",
      nonstopOnly: false,
      maxMiles: undefined,
      maxCash: undefined,
      active: true,
      pollIntervalMinutes: 60,
      minNotificationIntervalMinutes: 180,
      lastCheckedAt: undefined,
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    }

    expect(() => expandAlertDates(alert)).toThrow("Alert date range is invalid")
  })

  it("throws when a range contains a semantically invalid calendar date", () => {
    const alert: AlaskaAlert = {
      id: "alert-6",
      userId: "user-1",
      origin: "SFO",
      destination: "HNL",
      dateMode: "date_range",
      date: undefined,
      startDate: "2026-02-31",
      endDate: "2026-03-02",
      cabin: "economy",
      nonstopOnly: false,
      maxMiles: undefined,
      maxCash: undefined,
      active: true,
      pollIntervalMinutes: 60,
      minNotificationIntervalMinutes: 180,
      lastCheckedAt: undefined,
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    }

    expect(() => expandAlertDates(alert)).toThrow("Alert date range is invalid")
  })

  it("throws when a single-date alert contains an invalid date", () => {
    const alert: AlaskaAlert = {
      id: "alert-7",
      userId: "user-1",
      origin: "SFO",
      destination: "HNL",
      dateMode: "single_date",
      date: "2026-13-01",
      startDate: undefined,
      endDate: undefined,
      cabin: "business",
      nonstopOnly: true,
      maxMiles: 45000,
      maxCash: 50,
      active: true,
      pollIntervalMinutes: 60,
      minNotificationIntervalMinutes: 180,
      lastCheckedAt: undefined,
      createdAt: "2026-04-18T00:00:00.000Z",
      updatedAt: "2026-04-18T00:00:00.000Z",
    }

    expect(() => expandAlertDates(alert)).toThrow("Invalid single-date alert date")
  })
})
