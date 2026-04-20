import cors from "cors"
import express, { type Express, type NextFunction, type Request, type Response } from "express"
import {
  createAwardAlertsHttpHandlers,
  mapAwardAlertsError,
  type AwardAlertsHttpService,
} from "./http-handlers.js"

export type AwardAlertsServerDeps = {
  service: AwardAlertsHttpService
}

export function createAwardAlertsApp({ service }: AwardAlertsServerDeps): Express {
  const app = express()
  const handlers = createAwardAlertsHttpHandlers(service)

  app.disable("x-powered-by")
  app.use(cors())
  app.use(express.json({ strict: false }))

  app.get("/health", handlers.health)

  app.get("/api/award-alerts/status", handlers.getStatus)
  app.post("/api/award-alerts/operations/run-evaluator", handlers.runEvaluator)
  app.post("/api/award-alerts/operations/run-notifier", handlers.runNotifier)
  app.post("/api/award-alerts/operations/run-scraper", handlers.runScraperBatch)
  app.post("/api/award-alerts/operations/preview", handlers.previewAlert)
  app.get("/api/award-alerts/:id/runs", handlers.getAlertRuns)
  app.get("/api/award-alerts/:id/notifications", handlers.getAlertNotifications)
  app.post("/api/award-alerts", handlers.createAlert)
  app.get("/api/award-alerts", handlers.listAlerts)
  app.get("/api/award-alerts/:id", handlers.getAlert)
  app.patch("/api/award-alerts/:id", handlers.updateAlert)
  app.post("/api/award-alerts/:id/pause", handlers.pauseAlert)
  app.post("/api/award-alerts/:id/resume", handlers.resumeAlert)
  app.delete("/api/award-alerts/:id", handlers.deleteAlert)

  app.use((_req, res) => {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "Route not found",
      },
    })
  })

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (
      error instanceof SyntaxError
      && typeof (error as { type?: unknown }).type === "string"
      && (error as { type?: string }).type === "entity.parse.failed"
    ) {
      res.status(400).json({
        error: {
          code: "bad_request",
          message: "Malformed JSON body",
        },
      })
      return
    }

    const mapped = mapAwardAlertsError(error)
    res.status(mapped.status).json(mapped.body)
  })

  return app
}

export function startAwardAlertsServer({ service }: AwardAlertsServerDeps, port = Number(process.env["PORT"] ?? 2233)) {
  return createAwardAlertsApp({ service }).listen(port)
}
