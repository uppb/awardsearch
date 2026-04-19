import type { NotificationEvent } from "./types.js"

export type NotificationRepository = {
  markNotificationAttempting: (id: string, attemptedAt: string) => Promise<void>
  markNotificationSent: (id: string, sentAt: string) => Promise<void>
  markNotificationDeliveredUnconfirmed: (id: string, reason: string) => Promise<void>
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

const safeResponseText = async (response: DiscordWebhookResponse) => {
  try {
    return await response.text()
  } catch {
    return ""
  }
}

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
  const recordAmbiguousFailure = async (reason: string) => {
    try {
      await repository.markNotificationDeliveredUnconfirmed(event.id, reason)
    } catch {
      // Best effort: keep the notifier moving even if the terminal write fails.
    }
  }

  const recordPermanentFailure = async (reason: string) => {
    try {
      await repository.markNotificationFailed(event.id, reason)
    } catch {
      // Best effort: keep the notifier moving even if the failure write fails.
    }
  }

  try {
    await repository.markNotificationAttempting(event.id, now.toISOString())
  } catch {
    return
  }

  try {
    const response = await fetchFn(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: buildDiscordWebhookBody(event, username, avatarUrl),
    })

    if (!response.ok) {
      const responseText = await safeResponseText(response)
      const reason = `Discord webhook request failed with status ${response.status}: ${responseText}`
      if (response.status === 429 || response.status >= 500)
        await recordAmbiguousFailure(`At-most-once: ${reason}`)
      else
        await recordPermanentFailure(reason)
      return
    }

    try {
      await repository.markNotificationSent(event.id, now.toISOString())
    } catch (error) {
      await recordAmbiguousFailure(`At-most-once: Discord accepted the webhook but sent-status persistence failed: ${(error as Error).message}`)
    }
  } catch (error) {
    await recordAmbiguousFailure(`At-most-once: Discord webhook delivery may have started but failed before confirmation: ${(error as Error).message}`)
  }
}
