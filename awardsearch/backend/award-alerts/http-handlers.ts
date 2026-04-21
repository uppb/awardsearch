import type { NextFunction, Request, Response } from "express"
import type { AwardAlertPatchInput, AwardAlertWriteInput } from "./validation.js"
import type { RawScraperBatchInput } from "./types.js"

export type AwardAlertsHttpService = {
  listAlerts: () => Promise<unknown[]> | unknown[]
  getAlert: (id: string) => Promise<unknown | undefined> | unknown | undefined
  createAlert: (input: AwardAlertWriteInput) => Promise<unknown> | unknown
  updateAlert: (id: string, patch: AwardAlertPatchInput) => Promise<unknown> | unknown
  pauseAlert: (id: string) => Promise<unknown> | unknown
  resumeAlert: (id: string) => Promise<unknown> | unknown
  deleteAlert: (id: string) => Promise<unknown> | unknown
  previewAlert: (input: AwardAlertWriteInput) => Promise<unknown> | unknown
  getAlertRuns: (alertId: string) => Promise<unknown[]> | unknown[]
  getAlertNotifications: (alertId: string) => Promise<unknown[]> | unknown[]
  getStatus: () => Promise<unknown> | unknown
  triggerEvaluatorRun: () => Promise<unknown> | unknown
  triggerNotifierRun: () => Promise<unknown> | unknown
  runScraperBatch: (input: RawScraperBatchInput) => Promise<unknown> | unknown
}

export type AwardAlertsHttpErrorBody = {
  error: {
    code: "alert_not_found" | "bad_request" | "not_found"
    message: string
  }
}

export type AwardAlertsHttpError = {
  status: 400 | 404
  body: AwardAlertsHttpErrorBody
}

export type AwardAlertsHttpHandlers = {
  health: (req: Request, res: Response) => void
  listAlerts: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  getAlert: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  createAlert: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  updateAlert: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  pauseAlert: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  resumeAlert: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  deleteAlert: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  getStatus: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  runEvaluator: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  runNotifier: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  runScraperBatch: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  previewAlert: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  getAlertRuns: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
  getAlertNotifications: (req: Request, res: Response, next: NextFunction) => void | Promise<void>
}

const jsonError = (status: 400 | 404, code: AwardAlertsHttpErrorBody["error"]["code"], message: string): AwardAlertsHttpError => ({
  status,
  body: {
    error: {
      code,
      message,
    },
  },
})

export const mapAwardAlertsError = (error: unknown): AwardAlertsHttpError => {
  if (error instanceof Error && error.message.startsWith("award alert not found:"))
    return jsonError(404, "alert_not_found", error.message)

  if (error instanceof Error)
    return jsonError(400, "bad_request", error.message)

  return jsonError(400, "bad_request", "Request failed")
}

const asyncRoute = (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res)
    } catch (error) {
      next(error)
    }
  }

const send = (res: Response, value: unknown, status = 200) => {
  res.status(status).json(value ?? {})
}

const getAlertId = (req: Request) => {
  const alertId = req.params["id"]
  if (typeof alertId !== "string" || alertId.length === 0)
    throw new Error("Invalid alert id")
  return alertId
}

const getJsonObjectBody = <T>(req: Request): T => {
  const body: unknown = req.body
  if (body == null || typeof body !== "object" || Array.isArray(body))
    throw new Error("request body must be a JSON object")
  if (Object.keys(body).length === 0)
    throw new Error("request body must be a non-empty JSON object")
  return body as T
}

export const createAwardAlertsHttpHandlers = (service: AwardAlertsHttpService): AwardAlertsHttpHandlers => ({
  health: (_req, res) => {
    res.json({ ok: true })
  },

  listAlerts: asyncRoute(async (_req, res) => {
    send(res, await service.listAlerts())
  }),

  getAlert: asyncRoute(async (req, res) => {
    const alertId = getAlertId(req)
    const alert = await service.getAlert(alertId)
    if (!alert)
      throw new Error(`award alert not found: ${alertId}`)
    send(res, alert)
  }),

  createAlert: asyncRoute(async (req, res) => {
    send(res, await service.createAlert(getJsonObjectBody<AwardAlertWriteInput>(req)), 201)
  }),

  updateAlert: asyncRoute(async (req, res) => {
    const alertId = getAlertId(req)
    send(res, await service.updateAlert(alertId, getJsonObjectBody<AwardAlertPatchInput>(req)))
  }),

  pauseAlert: asyncRoute(async (req, res) => {
    send(res, await service.pauseAlert(getAlertId(req)))
  }),

  resumeAlert: asyncRoute(async (req, res) => {
    send(res, await service.resumeAlert(getAlertId(req)))
  }),

  deleteAlert: asyncRoute(async (req, res) => {
    send(res, await service.deleteAlert(getAlertId(req)))
  }),

  getStatus: asyncRoute(async (_req, res) => {
    send(res, await service.getStatus())
  }),

  runEvaluator: asyncRoute(async (_req, res) => {
    send(res, await service.triggerEvaluatorRun())
  }),

  runNotifier: asyncRoute(async (_req, res) => {
    send(res, await service.triggerNotifierRun())
  }),

  runScraperBatch: asyncRoute(async (req, res) => {
    send(res, await service.runScraperBatch(getJsonObjectBody<RawScraperBatchInput>(req)))
  }),

  previewAlert: asyncRoute(async (req, res) => {
    send(res, await service.previewAlert(getJsonObjectBody<AwardAlertWriteInput>(req)))
  }),

  getAlertRuns: asyncRoute(async (req, res) => {
    const alertId = getAlertId(req)
    const alert = await service.getAlert(alertId)
    if (!alert)
      throw new Error(`award alert not found: ${alertId}`)
    send(res, await service.getAlertRuns(alertId))
  }),

  getAlertNotifications: asyncRoute(async (req, res) => {
    const alertId = getAlertId(req)
    const alert = await service.getAlert(alertId)
    if (!alert)
      throw new Error(`award alert not found: ${alertId}`)
    send(res, await service.getAlertNotifications(alertId))
  }),
})
