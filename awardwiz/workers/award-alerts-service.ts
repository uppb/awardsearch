/* eslint-disable no-console */

import { randomUUID } from "node:crypto"
import { pathToFileURL } from "node:url"
import { createLoopRunner } from "../backend/award-alerts/loop-runner.js"
import { buildDefaultAwardAlertProviders } from "../backend/award-alerts/providers/index.js"
import { createAwardAlertsService } from "../backend/award-alerts/service.js"
import { createAwardAlertsApp } from "../backend/award-alerts/server.js"
import { SqliteAwardAlertsRepository } from "../backend/award-alerts/sqlite-repository.js"
import { openAwardAlertsDb } from "../backend/award-alerts/sqlite.js"
import { runEvaluatorWorker } from "./award-alerts-evaluator.js"
import { runNotifierWorker } from "./award-alerts-notifier.js"
import type { AwardAlertProviders } from "../backend/award-alerts/types.js"
import type { LoopRunnerLogger } from "../backend/award-alerts/loop-runner.js"

export type AwardAlertsServiceOptions = {
  databasePath?: string
  port?: number
  evaluatorIntervalMs?: number
  notifierIntervalMs?: number
  providers?: AwardAlertProviders
  fetchFn?: typeof fetch
  webhookUrl?: string
  username?: string
  avatarUrl?: string
  logger?: LoopRunnerLogger
}

export type RunningAwardAlertsService = {
  baseUrl: string
  close: () => Promise<void>
}

export type AwardAlertsServiceShutdownController = {
  waitForShutdown: Promise<void>
  dispose: () => void
}

export type AwardAlertsServiceShutdownControllerDeps = {
  once?: (signal: NodeJS.Signals, handler: () => void) => void
  removeListener?: (signal: NodeJS.Signals, handler: () => void) => void
}

const parseIntervalMs = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const createAwardAlertsServiceShutdownController = (
  service: Pick<RunningAwardAlertsService, "close">,
  {
    once = (signal, handler) => process.once(signal, handler),
    removeListener = (signal, handler) => process.removeListener(signal, handler),
  }: AwardAlertsServiceShutdownControllerDeps = {},
): AwardAlertsServiceShutdownController => {
  let settled = false
  let resolveShutdown!: () => void
  let rejectShutdown!: (error: unknown) => void
  const handlers = new Map<NodeJS.Signals, () => void>()

  const waitForShutdown = new Promise<void>((resolve, reject) => {
    resolveShutdown = resolve
    rejectShutdown = reject
  })

  const dispose = () => {
    for (const [signal, handler] of handlers)
      removeListener(signal, handler)
    handlers.clear()
  }

  const handleSignal = (signal: NodeJS.Signals) => {
    if (settled)
      return

    settled = true
    void service.close()
      .then(() => {
        dispose()
        resolveShutdown()
      })
      .catch((error: unknown) => {
        dispose()
        rejectShutdown(error)
      })
  }

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    const handler = () => handleSignal(signal)
    handlers.set(signal, handler)
    once(signal, handler)
  }

  return {
    waitForShutdown,
    dispose,
  }
}

export const startAwardAlertsService = async ({
  databasePath = process.env["DATABASE_PATH"] ?? "./tmp/award-alerts.sqlite",
  port = Number.parseInt(process.env["AWARD_ALERTS_PORT"] ?? process.env["PORT"] ?? "3000", 10),
  evaluatorIntervalMs = parseIntervalMs(process.env["AWARD_ALERTS_EVALUATOR_INTERVAL_MS"], 60_000),
  notifierIntervalMs = parseIntervalMs(process.env["AWARD_ALERTS_NOTIFIER_INTERVAL_MS"], 60_000),
  providers = buildDefaultAwardAlertProviders(),
  fetchFn = fetch,
  webhookUrl = process.env["DISCORD_WEBHOOK_URL"],
  username = process.env["DISCORD_USERNAME"],
  avatarUrl = process.env["DISCORD_AVATAR_URL"],
  logger = console,
}: AwardAlertsServiceOptions = {}): Promise<RunningAwardAlertsService> => {
  if (!webhookUrl)
    throw new Error("Missing DISCORD_WEBHOOK_URL environment variable")

  const db = openAwardAlertsDb(databasePath)
  const repository = new SqliteAwardAlertsRepository(db)

  const evaluatorLoop = createLoopRunner({
    name: "evaluator",
    intervalMs: evaluatorIntervalMs,
    run: () => runEvaluatorWorker({
      databasePath,
      repository,
      providers,
      now: new Date(),
    }),
    now: () => new Date(),
    logger,
  })

  const notifierLoop = createLoopRunner({
    name: "notifier",
    intervalMs: notifierIntervalMs,
    run: () => runNotifierWorker({
      databasePath,
      repository,
      fetchFn,
      webhookUrl,
      username,
      avatarUrl,
      now: new Date(),
    }),
    now: () => new Date(),
    logger,
  })

  const service = createAwardAlertsService({
    repository,
    providers,
    now: () => new Date(),
    generateId: randomUUID,
    runtimeStatus: () => ({
      databasePath,
      evaluator: evaluatorLoop.getStatus(),
      notifier: notifierLoop.getStatus(),
    }),
    runEvaluator: () => evaluatorLoop.trigger("manual"),
    runNotifier: () => notifierLoop.trigger("manual"),
  })

  const app = createAwardAlertsApp({ service })

  const server = await new Promise<import("node:http").Server>((resolve, reject) => {
    const listeningServer = app.listen(port, () => resolve(listeningServer))
    listeningServer.on("error", reject)
  })

  evaluatorLoop.start()
  notifierLoop.start()

  const address = server.address()
  if (address == null || typeof address === "string")
    throw new Error("award alerts service did not bind to a network address")

  let closed = false

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async close() {
      if (closed)
        return
      closed = true

      evaluatorLoop.beginShutdown()
      notifierLoop.beginShutdown()

      try {
        await new Promise<void>((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve())
        })
      } finally {
        await evaluatorLoop.stop()
        await notifierLoop.stop()
        db.close()
      }
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const service = await startAwardAlertsService()
  const shutdown = createAwardAlertsServiceShutdownController(service)

  try {
    await shutdown.waitForShutdown
  } catch (error) {
    process.exitCode = 1
    console.error(error)
  } finally {
    shutdown.dispose()
  }
}
