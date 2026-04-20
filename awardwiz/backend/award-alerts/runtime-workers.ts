/* eslint-disable no-console */

import { evaluateOneAlert } from "./evaluator.js"
import { buildDefaultAwardAlertProviders } from "./providers/index.js"
import { sendNotificationEvent } from "./notifier.js"
import { claimDueAlerts } from "./scheduler.js"
import { SqliteAwardAlertsRepository } from "./sqlite-repository.js"
import { openAwardAlertsDb } from "./sqlite.js"
import type { AwardAlertsRepository, AwardAlertProviders } from "./types.js"

type EvaluatorWorkerRepository = AwardAlertsRepository & {
  claimDueAlerts: SqliteAwardAlertsRepository["claimDueAlerts"]
}

type EvaluatorWorkerOptions = {
  databasePath?: string
  repository?: EvaluatorWorkerRepository
  providers?: AwardAlertProviders
  now?: Date
}

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

export const runEvaluatorWorker = async ({
  databasePath,
  repository: injectedRepository,
  providers = buildDefaultAwardAlertProviders(),
  now = new Date(),
}: EvaluatorWorkerOptions = {}) => {
  const dbPath = databasePath ?? process.env["DATABASE_PATH"] ?? "./tmp/award-alerts.sqlite"
  const db = injectedRepository ? undefined : openAwardAlertsDb(dbPath)
  const repository = injectedRepository ?? new SqliteAwardAlertsRepository(db!)

  try {
    const dueAlerts = await claimDueAlerts(repository, now)

    for (const alert of dueAlerts) {
      try {
        await evaluateOneAlert({
          alert,
          repository,
          providers,
          now,
        })
      } catch (error) {
        console.error(`failed to evaluate award alert ${alert.id}:`, error)
      }
    }

    console.log(`processed ${dueAlerts.length} award alert(s)`)
    return dueAlerts.length
  } finally {
    db?.close()
  }
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
