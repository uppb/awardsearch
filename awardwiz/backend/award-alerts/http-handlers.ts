import type { NextFunction, Request, Response } from "express"
import type { AwardAlertPatchInput, AwardAlertWriteInput } from "./validation.js"

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
}

export type AwardAlertsHttpErrorBody = {
  error: {
    code: "alert_not_found" | "bad_request"
    message: string
  }
}

export type AwardAlertsHttpError = {
  status: 400 | 404
  body: AwardAlertsHttpErrorBody
}

export type AwardAlertsHttpHandlers = {
  health: (req: Request, res: Response) => void
  listAlerts: (req: Request, res: Response, next: NextFunction) => Promise<void>
  getAlert: (req: Request, res: Response, next: NextFunction) => Promise<void>
  createAlert: (req: Request, res: Response, next: NextFunction) => Promise<void>
  updateAlert: (req: Request, res: Response, next: NextFunction) => Promise<void>
  pauseAlert: (req: Request, res: Response, next: NextFunction) => Promise<void>
  resumeAlert: (req: Request, res: Response, next: NextFunction) => Promise<void>
  deleteAlert: (req: Request, res: Response, next: NextFunction) => Promise<void>
  getStatus: (req: Request, res: Response, next: NextFunction) => Promise<void>
  runEvaluator: (req: Request, res: Response, next: NextFunction) => Promise<void>
  runNotifier: (req: Request, res: Response, next: NextFunction) => Promise<void>
  previewAlert: (req: Request, res: Response, next: NextFunction) => Promise<void>
  getAlertRuns: (req: Request, res: Response, next: NextFunction) => Promise<void>
  getAlertNotifications: (req: Request, res: Response, next: NextFunction) => Promise<void>
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
  (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next)
  }

const send = async (res: Response, value: unknown, status = 200) => {
  res.status(status).json(value ?? {})
}

export const createAwardAlertsHttpHandlers = (service: AwardAlertsHttpService): AwardAlertsHttpHandlers => ({
  health: (_req, res) => {
    res.json({ ok: true })
  },

  listAlerts: asyncRoute(async (_req, res) => {
    await send(res, await service.listAlerts())
  }),

  getAlert: asyncRoute(async (req, res) => {
    const alert = await service.getAlert(req.params.id)
    if (!alert)
      throw new Error(`award alert not found: ${req.params.id}`)
    await send(res, alert)
  }),

  createAlert: asyncRoute(async (req, res) => {
    await send(res, await service.createAlert(req.body as AwardAlertWriteInput), 201)
  }),

  updateAlert: asyncRoute(async (req, res) => {
    await send(res, await service.updateAlert(req.params.id, req.body as AwardAlertPatchInput))
  }),

  pauseAlert: asyncRoute(async (req, res) => {
    await send(res, await service.pauseAlert(req.params.id))
  }),

  resumeAlert: asyncRoute(async (req, res) => {
    await send(res, await service.resumeAlert(req.params.id))
  }),

  deleteAlert: asyncRoute(async (req, res) => {
    await send(res, await service.deleteAlert(req.params.id))
  }),

  getStatus: asyncRoute(async (_req, res) => {
    await send(res, await service.getStatus())
  }),

  runEvaluator: asyncRoute(async (_req, res) => {
    await send(res, await service.triggerEvaluatorRun())
  }),

  runNotifier: asyncRoute(async (_req, res) => {
    await send(res, await service.triggerNotifierRun())
  }),

  previewAlert: asyncRoute(async (req, res) => {
    await send(res, await service.previewAlert(req.body as AwardAlertWriteInput))
  }),

  getAlertRuns: asyncRoute(async (req, res) => {
    const alert = await service.getAlert(req.params.id)
    if (!alert)
      throw new Error(`award alert not found: ${req.params.id}`)
    await send(res, await service.getAlertRuns(req.params.id))
  }),

  getAlertNotifications: asyncRoute(async (req, res) => {
    const alert = await service.getAlert(req.params.id)
    if (!alert)
      throw new Error(`award alert not found: ${req.params.id}`)
    await send(res, await service.getAlertNotifications(req.params.id))
  }),
})
