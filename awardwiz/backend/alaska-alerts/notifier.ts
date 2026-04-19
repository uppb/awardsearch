import type { NotificationEvent } from "./types.js"

export type NotificationRepository = {
  markNotificationSent: (id: string, sentAt: string) => Promise<void>
  markNotificationFailed: (id: string, reason: string) => Promise<void>
}

export type DiscordWebhookResponse = {
  ok: boolean
  status: number
  text: () => Promise<string>
}

export type DiscordWebhookFetch = (input: string, init: {
  method: "POST"
  headers: Record<string, string>
  body: string
}) => Promise<DiscordWebhookResponse>

const formatLimit = (value: number | undefined, label: string) => value === undefined ? `Any ${label}` : `${value.toLocaleString()} ${label}`

const buildDiscordWebhookBody = (event: NotificationEvent, username: string | undefined, avatarUrl: string | undefined) => {
  const bestMatch = event.payload.bestMatch
  const body = {
    username,
    avatar_url: avatarUrl,
    allowed_mentions: { parse: [] as string[] },
    embeds: [{
      title: `AwardWiz Alaska alert: ${event.payload.origin} → ${event.payload.destination}`,
      url: event.payload.bookingUrl,
      color: 0x5865f2,
      description: bestMatch
        ? `${event.payload.matchCount} match${event.payload.matchCount === 1 ? "" : "es"} found for ${event.payload.cabin} cabin.`
        : `${event.payload.matchCount} match${event.payload.matchCount === 1 ? "" : "es"} found.`,
      fields: [
        {
          name: "Matched dates",
          value: event.payload.matchedDates.join(", "),
          inline: false,
        },
        {
          name: "Booking URL",
          value: `[Open Alaska booking link](${event.payload.bookingUrl})`,
          inline: false,
        },
        {
          name: "Limits",
          value: `${event.payload.nonstopOnly ? "Nonstop only" : "Connecting allowed"} | ${formatLimit(event.payload.maxMiles, "miles")} | ${formatLimit(event.payload.maxCash, "cash")}`,
          inline: false,
        },
        ...(bestMatch ? [{
          name: "Best match",
          value: [
            `${bestMatch.flightNo} on ${bestMatch.date}`,
            `${bestMatch.departureDateTime} - ${bestMatch.arrivalDateTime}`,
            `${bestMatch.miles.toLocaleString()} miles${bestMatch.cash > 0 ? ` + ${bestMatch.currencyOfCash} ${bestMatch.cash.toFixed(2)}` : ""}`,
          ].join("\n"),
          inline: false,
        }] : []),
      ],
    }],
  }

  return JSON.stringify(body)
}

export const sendNotificationEvent = async ({ event, repository, now, webhookUrl, fetchFn, username, avatarUrl }: {
  event: NotificationEvent
  repository: NotificationRepository
  now: Date
  webhookUrl: string
  fetchFn: DiscordWebhookFetch
  username?: string
  avatarUrl?: string
}) => {
  try {
    const response = await fetchFn(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: buildDiscordWebhookBody(event, username, avatarUrl),
    })

    if (!response.ok) {
      const responseText = await response.text()
      throw new Error(`Discord webhook request failed with status ${response.status}: ${responseText}`)
    }

    await repository.markNotificationSent(event.id, now.toISOString())
  } catch (error) {
    await repository.markNotificationFailed(event.id, (error as Error).message)
  }
}
