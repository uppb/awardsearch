/* eslint-disable no-console */

import { pathToFileURL } from "node:url"
import { memoizeAlaskaSearch } from "../backend/alaska-alerts/alaska-search.js"
import { evaluateOneAlert } from "../backend/award-alerts/evaluator.js"
import { alaskaProvider } from "../backend/award-alerts/providers/alaska/matcher.js"
import { claimDueAlerts } from "../backend/award-alerts/scheduler.js"
import { SqliteAwardAlertsRepository } from "../backend/award-alerts/sqlite-repository.js"
import { openAwardAlertsDb } from "../backend/award-alerts/sqlite.js"

export const runEvaluatorWorker = async () => {
  const db = openAwardAlertsDb(process.env["DATABASE_PATH"] ?? "./tmp/award-alerts.sqlite")
  const repository = new SqliteAwardAlertsRepository(db)
  const providers = {
    alaska: {
      ...alaskaProvider,
      search: memoizeAlaskaSearch(alaskaProvider.search),
    },
  }

  try {
    const dueAlerts = await claimDueAlerts(repository, new Date())

    for (const alert of dueAlerts) {
      try {
        await evaluateOneAlert({
          alert,
          repository,
          providers,
          now: new Date(),
        })
      } catch (error) {
        console.error(`failed to evaluate award alert ${alert.id}:`, error)
      }
    }

    console.log(`processed ${dueAlerts.length} award alert(s)`)
  } finally {
    db.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await runEvaluatorWorker()
