import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendNotificationEvent } from "../../../awardwiz/backend/alaska-alerts/notifier.js"
import type { NotificationEvent } from "../../../awardwiz/backend/alaska-alerts/types.js"

const getUser = vi.fn()

vi.mock("firebase-admin", () => ({
  default: {
    auth: vi.fn(() => ({
      getUser,
    })),
  },
}))

vi.mock("../../../awardwiz/backend/alaska-alerts/firebase-admin.js", () => ({
  getFirebaseAdminApp: vi.fn(() => ({})),
}))

describe("sendNotificationEvent", () => {
  beforeEach(() => {
    getUser.mockReset()
  })

  it("marks the event as sent after a successful email delivery", async () => {
    const event: NotificationEvent = {
      id: "event-1",
      alertId: "alert-1",
      userId: "user-1",
      createdAt: "2026-04-18T06:00:00.000Z",
      channel: "email",
      payload: {
        origin: "SFO",
        destination: "HNL",
        cabin: "business",
        matchedDates: ["2026-07-01"],
        matchCount: 1,
        nonstopOnly: true,
        maxMiles: 90000,
        maxCash: 10,
        bestMatch: {
          date: "2026-07-01",
          flightNo: "AS 843",
          origin: "SFO",
          destination: "HNL",
          departureDateTime: "2026-07-01 19:42",
          arrivalDateTime: "2026-07-01 22:11",
          cabin: "business",
          miles: 80000,
          cash: 5.6,
          currencyOfCash: "USD",
          bookingClass: "D",
          segmentCount: 1,
        },
        bookingUrl: "https://www.alaskaair.com/search/results?A=1&O=SFO&D=HNL&OD=2026-07-01&OT=Anytime&RT=false&UPG=none&ShoppingMethod=onlineaward&locale=en-us",
      },
      status: "pending",
      sentAt: undefined,
      failureReason: undefined,
    }

    getUser.mockResolvedValue({ email: "user@example.com", displayName: "User" })
    const transporter = { sendMail: vi.fn().mockResolvedValue({ response: "250 ok" }) }
    const repository = {
      markNotificationSent: vi.fn().mockResolvedValue(undefined),
      markNotificationFailed: vi.fn().mockResolvedValue(undefined),
    }

    await sendNotificationEvent({ event, transporter, repository, now: new Date("2026-04-18T06:05:00.000Z") })

    expect(repository.markNotificationSent).toHaveBeenCalledWith("event-1", "2026-04-18T06:05:00.000Z")
    expect(repository.markNotificationFailed).not.toHaveBeenCalled()
  })
})
