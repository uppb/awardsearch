import { describe, expect, it } from "vitest"
import type { AwardAlert } from "../../../awardwiz/backend/award-alerts/types.js"
import {
  applyAlertPatch,
  buildAlertFromInput,
  buildPreviewAlertFromInput,
} from "../../../awardwiz/backend/award-alerts/validation.js"

describe("award alert validation", () => {
  it("builds a single-date alert without a userId", () => {
    const alert = buildAlertFromInput({
      input: {
        program: "alaska",
        origin: "SHA",
        destination: "HND",
        date: "2026-05-02",
        cabin: "business",
        maxMiles: 35000,
      },
      now: new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-test-id",
    })

    expect(alert).toMatchObject({
      id: "alert-test-id",
      userId: undefined,
      dateMode: "single_date",
      date: "2026-05-02",
      pollIntervalMinutes: 1,
      minNotificationIntervalMinutes: 10,
    })
  })

  it("applies a patch that pauses an alert and preserves immutable fields", () => {
    const baseAlert: AwardAlert = {
      id: "alert-1",
      program: "alaska",
      userId: "user-1",
      origin: "SHA",
      destination: "HND",
      dateMode: "single_date",
      date: "2026-05-02",
      cabin: "business",
      nonstopOnly: true,
      maxMiles: 35000,
      maxCash: 25,
      active: true,
      pollIntervalMinutes: 1,
      minNotificationIntervalMinutes: 10,
      lastCheckedAt: undefined,
      nextCheckAt: "2026-04-20T00:00:00.000Z",
      createdAt: "2026-04-20T00:00:00.000Z",
      updatedAt: "2026-04-20T00:00:00.000Z",
    }

    const updated = applyAlertPatch(
      baseAlert,
      {
        active: false,
        userId: null,
        maxMiles: null,
        maxCash: 12.5,
      },
      new Date("2026-04-20T00:05:00.000Z"),
    )

    expect(updated).toMatchObject({
      id: "alert-1",
      program: "alaska",
      active: false,
      nextCheckAt: undefined,
      userId: undefined,
      maxMiles: undefined,
      maxCash: 12.5,
      updatedAt: "2026-04-20T00:05:00.000Z",
    })
  })

  it("builds a transient date-range preview alert without persistence fields", () => {
    const previewAlert = buildPreviewAlertFromInput({
      program: "alaska",
      origin: "SHA",
      destination: "HND",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
      cabin: "business",
      nonstopOnly: true,
      maxMiles: 35000,
    })

    expect(previewAlert).toMatchObject({
      program: "alaska",
      dateMode: "date_range",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
    })
    expect("id" in previewAlert).toBe(false)
    expect("createdAt" in previewAlert).toBe(false)
    expect("updatedAt" in previewAlert).toBe(false)
  })

  it("rejects invalid runtime values in the shared validation helper", () => {
    expect(() => buildAlertFromInput({
      input: {
        program: "alaska",
        userId: "   ",
        origin: "SHA",
        destination: "HND",
        date: "2026-05-02",
        cabin: "business",
      },
      now: new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-test-id",
    })).toThrow("Invalid value for userId")

    expect(() => buildAlertFromInput({
      input: {
        program: "alaska",
        origin: "SHA",
        destination: "HND",
        date: "2026-05-02",
        cabin: "premium-economy" as AwardAlert["cabin"],
      },
      now: new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-test-id",
    })).toThrow("Invalid cabin: premium-economy")

    expect(() => buildAlertFromInput({
      input: {
        program: "alaska",
        origin: "SHA",
        destination: "HND",
        date: "2026-05-02",
        cabin: "business",
        pollIntervalMinutes: 0,
      },
      now: new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-test-id",
    })).toThrow("Invalid positive integer for pollIntervalMinutes: 0")

    expect(() => buildAlertFromInput({
      input: {
        program: "alaska",
        origin: "SHA",
        destination: "HND",
        date: "2026-05-02",
        cabin: "business",
        maxMiles: -1,
      },
      now: new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-test-id",
    })).toThrow("Invalid non-negative integer for maxMiles: -1")

    expect(() => buildAlertFromInput({
      input: {
        program: "alaska",
        origin: "SHA",
        destination: "HND",
        date: "2026-05-02",
        cabin: "business",
        maxCash: Number.NaN,
      },
      now: new Date("2026-04-20T00:00:00.000Z"),
      generateId: () => "alert-test-id",
    })).toThrow("Invalid non-negative number for maxCash: NaN")
  })
})
