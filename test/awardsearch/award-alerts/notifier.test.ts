import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendNotificationEvent } from "../../../awardsearch/backend/award-alerts/notifier.js"
import type { NotificationEvent } from "../../../awardsearch/backend/award-alerts/types.js"

const parseJson = (value: string): unknown => JSON.parse(value)

describe("sendNotificationEvent", () => {
  const event: NotificationEvent = {
    id: "event-1",
    alertId: "alert-1",
    userId: "user-1",
    createdAt: "2026-04-18T06:00:00.000Z",
    status: "processing",
    claimedAt: undefined,
    claimToken: "claim-1",
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
      bookingUrl: "https://example.test/booking",
    },
    attemptedAt: undefined,
    sentAt: undefined,
    failureReason: undefined,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const buildRepository = () => ({
    markNotificationAttempting: vi.fn().mockResolvedValue(undefined),
    markNotificationSent: vi.fn().mockResolvedValue(undefined),
    markNotificationDeliveredUnconfirmed: vi.fn().mockResolvedValue(undefined),
    markNotificationFailed: vi.fn().mockResolvedValue(undefined),
  })

  it("marks the event as sent after a successful Discord POST", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    })
    const repository = buildRepository()

    await sendNotificationEvent({
      event,
      repository,
      now: new Date("2026-04-18T06:05:00.000Z"),
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    })

    expect(repository.markNotificationAttempting).toHaveBeenCalledWith("event-1", "2026-04-18T06:05:00.000Z", "claim-1")
    expect(repository.markNotificationSent).toHaveBeenCalledWith("event-1", "2026-04-18T06:05:00.000Z", "claim-1")
    expect(repository.markNotificationFailed).not.toHaveBeenCalled()
    const firstCall = fetchFn.mock.calls[0] as [string, RequestInit] | undefined
    expect(firstCall?.[0]).toBe("https://discord.test/webhook")
    expect(firstCall?.[1]).toMatchObject({
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    })

    const requestInit = firstCall?.[1]
    if (!requestInit?.body || typeof requestInit.body !== "string")
      throw new Error("expected JSON request body")

    const body = parseJson(requestInit.body) as {
      allowed_mentions: { parse: string[] }
      embeds: {
        title: string
        url?: string
        fields: {
          name: string
          value: string
        }[]
      }[]
    }
    expect(body.allowed_mentions.parse).toEqual([])
    expect(body.embeds).toHaveLength(1)
    const embed = body.embeds[0]
    if (!embed)
      throw new Error("expected discord embed")
    expect(embed.title).toBe("Award alert: SFO → HNL")
    expect(embed.url).toBe(event.payload.bookingUrl)
    expect(embed.fields).toEqual([
      { name: "Route", value: "SFO → HNL", inline: false },
      { name: "Matched dates", value: "2026-07-01", inline: false },
      { name: "Booking link", value: `[Open booking link](${event.payload.bookingUrl})`, inline: false },
      { name: "Limits", value: "Nonstop only | 90,000 miles | 10 cash", inline: false },
      expect.objectContaining({
        name: "Best match",
        inline: false,
      }),
    ])
    expect(embed.fields.find((field) => field.name === "Best match")?.value).toContain("AS 843 on 2026-07-01")
  })

  it("marks the event delivered_unconfirmed when Discord accepts the webhook but sent-status persistence fails", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    })
    const repository = {
      markNotificationAttempting: vi.fn().mockResolvedValue(undefined),
      markNotificationSent: vi.fn().mockRejectedValue(new Error("write failed")),
      markNotificationDeliveredUnconfirmed: vi.fn().mockResolvedValue(undefined),
      markNotificationFailed: vi.fn().mockResolvedValue(undefined),
    }

    await sendNotificationEvent({
      event,
      repository,
      now: new Date("2026-04-18T06:05:00.000Z"),
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    })

    expect(repository.markNotificationAttempting).toHaveBeenCalledWith("event-1", "2026-04-18T06:05:00.000Z", "claim-1")
    expect(repository.markNotificationSent).toHaveBeenCalledWith("event-1", "2026-04-18T06:05:00.000Z", "claim-1")
    expect(repository.markNotificationDeliveredUnconfirmed).toHaveBeenCalledWith(
      "event-1",
      expect.stringContaining("Discord accepted the webhook but sent-status persistence failed"),
      "claim-1",
    )
    expect(repository.markNotificationFailed).not.toHaveBeenCalled()
  })

  it("marks the event as failed when the Discord webhook returns a non-2xx response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue("bad request"),
    })
    const repository = buildRepository()

    await sendNotificationEvent({
      event,
      repository,
      now: new Date("2026-04-18T06:05:00.000Z"),
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    })

    expect(repository.markNotificationAttempting).toHaveBeenCalledWith("event-1", "2026-04-18T06:05:00.000Z", "claim-1")
    expect(repository.markNotificationSent).not.toHaveBeenCalled()
    expect(repository.markNotificationFailed).toHaveBeenCalledWith(
      "event-1",
      expect.stringContaining("Discord webhook request failed with status 400"),
      "claim-1",
    )
    expect(repository.markNotificationDeliveredUnconfirmed).not.toHaveBeenCalled()
  })

  it("marks the event delivered_unconfirmed when Discord returns an ambiguous failure", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: vi.fn().mockResolvedValue("rate limited"),
    })
    const repository = buildRepository()

    await sendNotificationEvent({
      event,
      repository,
      now: new Date("2026-04-18T06:05:00.000Z"),
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    })

    expect(repository.markNotificationDeliveredUnconfirmed).toHaveBeenCalledWith(
      "event-1",
      expect.stringContaining("At-most-once"),
      "claim-1",
    )
    expect(repository.markNotificationFailed).not.toHaveBeenCalled()
  })

  it("marks the event delivered_unconfirmed when fetch throws", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network down"))
    const repository = buildRepository()

    await sendNotificationEvent({
      event,
      repository,
      now: new Date("2026-04-18T06:05:00.000Z"),
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    })

    expect(repository.markNotificationDeliveredUnconfirmed).toHaveBeenCalledWith(
      "event-1",
      expect.stringContaining("At-most-once"),
      "claim-1",
    )
  })

  it("does not send Discord if the attempting transition cannot be recorded", async () => {
    const fetchFn = vi.fn()
    const repository = {
      markNotificationAttempting: vi.fn().mockRejectedValue(new Error("write failed")),
      markNotificationSent: vi.fn().mockResolvedValue(undefined),
      markNotificationDeliveredUnconfirmed: vi.fn().mockResolvedValue(undefined),
      markNotificationFailed: vi.fn().mockResolvedValue(undefined),
    }

    await sendNotificationEvent({
      event,
      repository,
      now: new Date("2026-04-18T06:05:00.000Z"),
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    })

    expect(repository.markNotificationAttempting).toHaveBeenCalledWith("event-1", "2026-04-18T06:05:00.000Z", "claim-1")
    expect(fetchFn).not.toHaveBeenCalled()
    expect(repository.markNotificationSent).not.toHaveBeenCalled()
    expect(repository.markNotificationDeliveredUnconfirmed).not.toHaveBeenCalled()
    expect(repository.markNotificationFailed).not.toHaveBeenCalled()
  })

  it("short-circuits when markNotificationAttempting rejects for a stale claim", async () => {
    const fetchFn = vi.fn()
    const repository = {
      markNotificationAttempting: vi.fn().mockRejectedValue(new Error("stale claim token")),
      markNotificationSent: vi.fn().mockResolvedValue(undefined),
      markNotificationDeliveredUnconfirmed: vi.fn().mockResolvedValue(undefined),
      markNotificationFailed: vi.fn().mockResolvedValue(undefined),
    }

    await sendNotificationEvent({
      event,
      repository,
      now: new Date("2026-04-18T06:05:00.000Z"),
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    })

    expect(repository.markNotificationAttempting).toHaveBeenCalledWith("event-1", "2026-04-18T06:05:00.000Z", "claim-1")
    expect(fetchFn).not.toHaveBeenCalled()
    expect(repository.markNotificationSent).not.toHaveBeenCalled()
    expect(repository.markNotificationDeliveredUnconfirmed).not.toHaveBeenCalled()
    expect(repository.markNotificationFailed).not.toHaveBeenCalled()
  })

  it("passes the claim token to terminal repository calls", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    })
    const repository = buildRepository()

    await sendNotificationEvent({
      event,
      repository,
      now: new Date("2026-04-18T06:05:00.000Z"),
      webhookUrl: "https://discord.test/webhook",
      fetchFn,
    })

    expect(repository.markNotificationSent).toHaveBeenCalledWith("event-1", "2026-04-18T06:05:00.000Z", "claim-1")
    expect(repository.markNotificationDeliveredUnconfirmed).not.toHaveBeenCalled()
    expect(repository.markNotificationFailed).not.toHaveBeenCalled()
  })
})
