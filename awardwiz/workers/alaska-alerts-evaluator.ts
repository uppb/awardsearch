/* eslint-disable no-console */

import { Listr } from "listr2"
import { claimDueAlerts } from "../backend/alaska-alerts/scheduler.js"
import { FirestoreAlaskaAlertsRepository } from "../backend/alaska-alerts/firestore-repository.js"
import { searchAlaska } from "../backend/alaska-alerts/alaska-search.js"
import { evaluateOneAlert } from "../backend/alaska-alerts/evaluator.js"

const repository = new FirestoreAlaskaAlertsRepository()
const dueAlerts = await claimDueAlerts(new Date())

await new Listr(dueAlerts.map((alert) => ({
  title: `Evaluating ${alert.origin}-${alert.destination} ${alert.id}`,
  task: async () => evaluateOneAlert({
    alert,
    repository,
    searchAlaska,
    now: new Date(),
  }),
})), {
  concurrent: 3,
  exitOnError: false,
  registerSignalListeners: false,
}).run()

console.log(`processed ${dueAlerts.length} alaska alert(s)`)
