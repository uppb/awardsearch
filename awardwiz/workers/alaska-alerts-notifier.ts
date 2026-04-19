/* eslint-disable no-console */

import { sendNotificationEvent } from "../backend/alaska-alerts/notifier.js"
import { FirestoreAlaskaAlertsRepository } from "../backend/alaska-alerts/firestore-repository.js"

const repository = new FirestoreAlaskaAlertsRepository()

const webhookUrl = process.env["DISCORD_WEBHOOK_URL"]
if (!webhookUrl)
  throw new Error("Missing DISCORD_WEBHOOK_URL environment variable")

const username = process.env["DISCORD_USERNAME"]
const avatarUrl = process.env["DISCORD_AVATAR_URL"]
const claimedAt = new Date().toISOString()
const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString()
const pendingEvents = await repository.claimPendingNotificationEvents(20, claimedAt, staleBefore)

for (const event of pendingEvents) {
  try {
    await sendNotificationEvent({
      event,
      repository,
      now: new Date(),
      webhookUrl,
      fetchFn: fetch,
      username,
      avatarUrl,
    })
  } catch (error) {
    console.error(`failed to process notification event ${event.id}:`, error)
  }
}

console.log(`processed ${pendingEvents.length} notification event(s)`)
