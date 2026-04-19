import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendNotificationEvent } from "../../../awardwiz/backend/alaska-alerts/notifier.js"
import type { NotificationEvent } from "../../../awardwiz/backend/alaska-alerts/types.js"

describe("sendNotificationEvent", () => {
  const event: NotificationEvent = {
    id: "event-1",
    alertId: "alert-1",
    userId: "user-1",
    createdAt: "2026-04-18T06:00:00.000Z",
    status: "pending",
    claimedAt: undefined,
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
    sentAt: undefined,
    failureReason: undefined,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("marks the event as sent after a successful Discord POST", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    })
    const repository = {
      markNotificationSent: vi.fn().mockResolvedValue(undefined),
      markNotificationPending: vi.fn().mockResolvedValue(undefined),
      markNotificationFailed: vi.fn().mockResolvedValue(undefined),
    }

    await sendNotificationEvent({
      event,
      repository,
      now: new Date("2026-04-18T06:05:00.000Z"),
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    } as any)

    expect(repository.markNotificationSent).toHaveBeenCalledWith("event-1", "2026-04-18T06:05:00.000Z")
    expect(repository.markNotificationFailed).not.toHaveBeenCalled()
    expect(fetchFn).toHaveBeenCalledWith("https://discord.test/webhook", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({
        "content-type": "application/json",
      }),
    }))
    const [, requestInit] = fetchFn.mock.calls[0]!
    const body = JSON.parse(requestInit.body)
    expect(body).toMatchObject({
      embeds: [{
        title: "AwardWiz Alaska alert: SFO → HNL",
        url: event.payload.bookingUrl,
      }],
    })
  })

  it("requeues the event when Discord returns a retryable 429 response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: vi.fn().mockResolvedValue("rate limited"),
    })
    const repository = {
      markNotificationSent: vi.fn().mockResolvedValue(undefined),
      markNotificationPending: vi.fn().mockResolvedValue(undefined),
      markNotificationFailed: vi.fn().mockResolvedValue(undefined),
    }

    await sendNotificationEvent({
      event,
      repository,
      now: new Date("2026-04-18T06:05:00.000Z"),
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    } as any)

    expect(repository.markNotificationSent).not.toHaveBeenCalled()
    expect(repository.markNotificationPending).toHaveBeenCalledWith(
      "event-1",
      expect.stringContaining("Discord webhook request failed with status 429"),
    )
    expect(repository.markNotificationFailed).not.toHaveBeenCalled()
  })

  it("marks the event as failed when the Discord webhook returns a non-2xx response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue("bad request"),
    })
    const repository = {
      markNotificationSent: vi.fn().mockResolvedValue(undefined),
      markNotificationPending: vi.fn().mockResolvedValue(undefined),
      markNotificationFailed: vi.fn().mockResolvedValue(undefined),
    }

    await sendNotificationEvent({
      event,
      repository,
      now: new Date("2026-04-18T06:05:00.000Z"),
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    } as any)

    expect(repository.markNotificationSent).not.toHaveBeenCalled()
    expect(repository.markNotificationFailed).toHaveBeenCalledWith(
      "event-1",
      expect.stringContaining("Discord webhook request failed with status 400"),
    )
    expect(repository.markNotificationFailed).toHaveBeenCalledWith(
      "event-1",
      expect.stringContaining("bad request"),
    )
  })

  it("does not mark the event failed when persisting sent status fails", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    })
    const repository = {
      markNotificationSent: vi.fn().mockRejectedValue(new Error("firestore unavailable")),
      markNotificationPending: vi.fn().mockResolvedValue(undefined),
      markNotificationFailed: vi.fn().mockResolvedValue(undefined),
    }

    await expect(sendNotificationEvent({
      event,
      repository,
      now: new Date("2026-04-18T06:05:00.000Z"),
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    } as any)).resolves.toBeUndefined()

    expect(repository.markNotificationSent).toHaveBeenCalledWith("event-1", "2026-04-18T06:05:00.000Z")
    expect(repository.markNotificationPending).toHaveBeenCalledWith(
      "event-1",
      expect.stringContaining("firestore unavailable"),
    )
    expect(repository.markNotificationFailed).not.toHaveBeenCalled()
  })
})
