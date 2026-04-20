/* eslint-disable no-console */

import { pathToFileURL } from "node:url"
import { sendNotificationEvent } from "../backend/award-alerts/notifier.js"
import { SqliteAwardAlertsRepository } from "../backend/award-alerts/sqlite-repository.js"
import { openAwardAlertsDb } from "../backend/award-alerts/sqlite.js"

export const runNotifierWorker = async () => {
  const webhookUrl = process.env["DISCORD_WEBHOOK_URL"]
  if (!webhookUrl)
    throw new Error("Missing DISCORD_WEBHOOK_URL environment variable")

  const db = openAwardAlertsDb(process.env["DATABASE_PATH"] ?? "./tmp/award-alerts.sqlite")
  const repository = new SqliteAwardAlertsRepository(db)
  const claimedAt = new Date().toISOString()
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const username = process.env["DISCORD_USERNAME"]
  const avatarUrl = process.env["DISCORD_AVATAR_URL"]

  try {
    const pendingEvents = repository.claimPendingNotificationEvents(20, claimedAt, staleBefore)

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
  } finally {
    db.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runNotifierWorker()
