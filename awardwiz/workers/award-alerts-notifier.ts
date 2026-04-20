/* eslint-disable no-console */

import { pathToFileURL } from "node:url"
import { sendNotificationEvent } from "../backend/award-alerts/notifier.js"
import { SqliteAwardAlertsRepository } from "../backend/award-alerts/sqlite-repository.js"
import { openAwardAlertsDb } from "../backend/award-alerts/sqlite.js"

type NotifierWorkerRepository = Pick<
  SqliteAwardAlertsRepository,
  | "claimPendingNotificationEvents"
  | "markNotificationAttempting"
  | "markNotificationSent"
  | "markNotificationDeliveredUnconfirmed"
  | "markNotificationFailed"
>

type NotifierWorkerOptions = {
  databasePath?: string
  repository?: NotifierWorkerRepository
  webhookUrl?: string
  fetchFn?: typeof fetch
  now?: Date
  username?: string
  avatarUrl?: string
}

export const runNotifierWorker = async ({
  databasePath,
  repository: injectedRepository,
  webhookUrl = process.env["DISCORD_WEBHOOK_URL"],
  fetchFn = fetch,
  now = new Date(),
  username = process.env["DISCORD_USERNAME"],
  avatarUrl = process.env["DISCORD_AVATAR_URL"],
}: NotifierWorkerOptions = {}) => {
  if (!webhookUrl)
    throw new Error("Missing DISCORD_WEBHOOK_URL environment variable")

  const dbPath = databasePath ?? process.env["DATABASE_PATH"] ?? "./tmp/award-alerts.sqlite"
  const db = injectedRepository ? undefined : openAwardAlertsDb(dbPath)
  const repository = injectedRepository ?? new SqliteAwardAlertsRepository(db!)
  const claimedAt = now.toISOString()
  const staleBefore = new Date(now.getTime() - 15 * 60 * 1000).toISOString()

  try {
    const pendingEvents = repository.claimPendingNotificationEvents(20, claimedAt, staleBefore)

    for (const event of pendingEvents) {
      try {
        await sendNotificationEvent({
          event,
          repository,
          now,
          webhookUrl,
          fetchFn,
          username,
          avatarUrl,
        })
      } catch (error) {
        console.error(`failed to process notification event ${event.id}:`, error)
      }
    }

    console.log(`processed ${pendingEvents.length} notification event(s)`)
    return pendingEvents.length
  } finally {
    db?.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runNotifierWorker()
