/* eslint-disable no-console */

import { pathToFileURL } from "node:url"
import { evaluateOneAlert } from "../backend/award-alerts/evaluator.js"
import { buildDefaultAwardAlertProviders } from "../backend/award-alerts/providers/index.js"
import { claimDueAlerts } from "../backend/award-alerts/scheduler.js"
import { SqliteAwardAlertsRepository } from "../backend/award-alerts/sqlite-repository.js"
import { openAwardAlertsDb } from "../backend/award-alerts/sqlite.js"
import type { AwardAlertsRepository, AwardAlertProviders } from "../backend/award-alerts/types.js"

type EvaluatorWorkerRepository = AwardAlertsRepository & {
  claimDueAlerts: SqliteAwardAlertsRepository["claimDueAlerts"]
}

type EvaluatorWorkerOptions = {
  databasePath?: string
  repository?: EvaluatorWorkerRepository
  providers?: AwardAlertProviders
  now?: Date
}

export const runEvaluatorWorker = async ({ databasePath, repository: injectedRepository, providers = buildDefaultAwardAlertProviders(), now = new Date() }: EvaluatorWorkerOptions = {}) => {
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runEvaluatorWorker()
