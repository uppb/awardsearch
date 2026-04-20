import { afterEach, describe, expect, it, vi } from "vitest"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { createAwardAlertsApp } from "../../../awardwiz/backend/award-alerts/server.js"

const alert = {
  id: "alert-1",
  program: "alaska",
  userId: undefined,
  origin: "SHA",
  destination: "HND",
  dateMode: "single_date",
  date: "2026-05-02",
  cabin: "business",
  nonstopOnly: true,
  maxMiles: 35000,
  maxCash: undefined,
  active: true,
  pollIntervalMinutes: 15,
  minNotificationIntervalMinutes: 60,
  lastCheckedAt: undefined,
  nextCheckAt: "2026-04-20T00:00:00.000Z",
  createdAt: "2026-04-20T00:00:00.000Z",
  updatedAt: "2026-04-20T00:00:00.000Z",
} as const

const updatedAlert = {
  ...alert,
  destination: "NRT",
  active: false,
  updatedAt: "2026-04-20T00:05:00.000Z",
} as const

const preview = {
  program: "alaska",
  userId: undefined,
  origin: "SHA",
  destination: "HND",
  dateMode: "single_date",
  date: "2026-05-02",
  cabin: "business",
  nonstopOnly: true,
  maxMiles: 35000,
  maxCash: undefined,
  active: true,
  pollIntervalMinutes: 15,
  minNotificationIntervalMinutes: 60,
} as const

const status = {
  databasePath: "./tmp/award-alerts.sqlite",
  evaluator: { running: false },
  notifier: { running: true },
}

type AwardAlertsHttpService = Parameters<typeof createAwardAlertsApp>[0]["service"]

const startServer = (service: AwardAlertsHttpService) => {
  const app = createAwardAlertsApp({ service })
  const server = app.listen(0)

  const baseUrl = () => {
    const address = server.address()
    if (!address || typeof address === "string")
      throw new Error("server did not start")
    return `http://127.0.0.1:${(address as AddressInfo).port}`
  }

  return { server, baseUrl }
}

const requestJson = async (
  baseUrl: () => string,
  path: string,
  init: RequestInit = {},
) => {
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  })

  const rawBody = await response.text()
  const body = rawBody.length > 0 ? JSON.parse(rawBody) : undefined

  return { response, body }
}

describe("award alerts HTTP API", () => {
  let server: Server | undefined

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server) {
        resolve()
        return
      }

      server.close((error) => {
        if (error)
          reject(error)
        else
          resolve()
      })
    })
    server = undefined
    vi.restoreAllMocks()
  })

  it("serves health, CRUD, operational, and history endpoints over HTTP", async () => {
    const service = {
      listAlerts: vi.fn(async () => [alert]),
      getAlert: vi.fn(async () => alert),
      createAlert: vi.fn(async () => alert),
      updateAlert: vi.fn(async () => updatedAlert),
      pauseAlert: vi.fn(async () => ({ ...alert, active: false })),
      resumeAlert: vi.fn(async () => ({ ...alert, active: true })),
      deleteAlert: vi.fn(async () => alert),
      previewAlert: vi.fn(async () => preview),
      getAlertRuns: vi.fn(async () => [{ id: "run-1" }]),
      getAlertNotifications: vi.fn(async () => [{ id: "event-1" }]),
      getStatus: vi.fn(() => status),
      triggerEvaluatorRun: vi.fn(async () => ({ started: "evaluator" })),
      triggerNotifierRun: vi.fn(async () => ({ started: "notifier" })),
    }

    const started = startServer(service)
    server = started.server

    let response = await requestJson(started.baseUrl, "/health")
    expect(response.response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })

    response = await requestJson(started.baseUrl, "/api/award-alerts", {
      method: "POST",
      body: JSON.stringify({
        program: "alaska",
        origin: "SHA",
        destination: "HND",
        date: "2026-05-02",
        cabin: "business",
        maxMiles: 35000,
      }),
    })
    expect(response.response.status).toBe(201)
    expect(response.body).toEqual(alert)
    expect(service.createAlert).toHaveBeenCalledWith(expect.objectContaining({
      program: "alaska",
      origin: "SHA",
      destination: "HND",
    }))

    response = await requestJson(started.baseUrl, "/api/award-alerts")
    expect(response.response.status).toBe(200)
    expect(response.body).toEqual([alert])

    response = await requestJson(started.baseUrl, "/api/award-alerts/alert-1")
    expect(response.response.status).toBe(200)
    expect(response.body).toEqual(alert)

    response = await requestJson(started.baseUrl, "/api/award-alerts/alert-1", {
      method: "PATCH",
      body: JSON.stringify({ destination: "NRT", active: false }),
    })
    expect(response.response.status).toBe(200)
    expect(response.body).toEqual(updatedAlert)
    expect(service.updateAlert).toHaveBeenCalledWith("alert-1", expect.objectContaining({
      destination: "NRT",
      active: false,
    }))

    response = await requestJson(started.baseUrl, "/api/award-alerts/alert-1/pause", { method: "POST" })
    expect(response.response.status).toBe(200)
    expect(response.body).toMatchObject({ active: false })

    response = await requestJson(started.baseUrl, "/api/award-alerts/alert-1/resume", { method: "POST" })
    expect(response.response.status).toBe(200)
    expect(response.body).toMatchObject({ active: true })

    response = await requestJson(started.baseUrl, "/api/award-alerts/status")
    expect(response.response.status).toBe(200)
    expect(response.body).toEqual(status)

    response = await requestJson(started.baseUrl, "/api/award-alerts/operations/run-evaluator", { method: "POST" })
    expect(response.response.status).toBe(200)
    expect(response.body).toEqual({ started: "evaluator" })

    response = await requestJson(started.baseUrl, "/api/award-alerts/operations/run-notifier", { method: "POST" })
    expect(response.response.status).toBe(200)
    expect(response.body).toEqual({ started: "notifier" })

    response = await requestJson(started.baseUrl, "/api/award-alerts/operations/preview", {
      method: "POST",
      body: JSON.stringify({
        program: "alaska",
        origin: "SHA",
        destination: "HND",
        date: "2026-05-02",
        cabin: "business",
        maxMiles: 35000,
      }),
    })
    expect(response.response.status).toBe(200)
    expect(response.body).toEqual(preview)

    response = await requestJson(started.baseUrl, "/api/award-alerts/alert-1/runs")
    expect(response.response.status).toBe(200)
    expect(response.body).toEqual([{ id: "run-1" }])

    response = await requestJson(started.baseUrl, "/api/award-alerts/alert-1/notifications")
    expect(response.response.status).toBe(200)
    expect(response.body).toEqual([{ id: "event-1" }])

    response = await requestJson(started.baseUrl, "/api/award-alerts/alert-1", { method: "DELETE" })
    expect(response.response.status).toBe(200)
    expect(response.body).toEqual(alert)
  })

  it("maps not found and bad request errors to a stable JSON shape", async () => {
    const service = {
      listAlerts: vi.fn(async () => []),
      getAlert: vi.fn(async () => undefined),
      createAlert: vi.fn(async () => {
        throw new Error("unsupported award program: aeroplan")
      }),
      updateAlert: vi.fn(async () => {
        throw new Error("award alert not found: alert-404")
      }),
      pauseAlert: vi.fn(async () => {
        throw new Error("award alert not found: alert-404")
      }),
      resumeAlert: vi.fn(async () => {
        throw new Error("award alert not found: alert-404")
      }),
      deleteAlert: vi.fn(async () => {
        throw new Error("award alert not found: alert-404")
      }),
      previewAlert: vi.fn(async () => {
        throw new Error("Invalid value for origin")
      }),
      getAlertRuns: vi.fn(async () => []),
      getAlertNotifications: vi.fn(async () => []),
      getStatus: vi.fn(() => status),
      triggerEvaluatorRun: vi.fn(async () => {
        throw new Error("scheduler offline")
      }),
      triggerNotifierRun: vi.fn(async () => {
        throw new Error("scheduler offline")
      }),
    }

    const started = startServer(service)
    server = started.server

    let response = await requestJson(started.baseUrl, "/api/award-alerts/alert-404")
    expect(response.response.status).toBe(404)
    expect(response.body).toEqual({
      error: {
        code: "alert_not_found",
        message: "award alert not found: alert-404",
      },
    })

    response = await requestJson(started.baseUrl, "/api/award-alerts", {
      method: "POST",
      body: JSON.stringify({
        program: "aeroplan",
        origin: "SHA",
        destination: "HND",
        date: "2026-05-02",
        cabin: "business",
      }),
    })
    expect(response.response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        code: "bad_request",
        message: "unsupported award program: aeroplan",
      },
    })

    response = await requestJson(started.baseUrl, "/api/award-alerts/alert-404", {
      method: "PATCH",
      body: JSON.stringify({ destination: "NRT" }),
    })
    expect(response.response.status).toBe(404)
    expect(response.body.error.code).toBe("alert_not_found")

    response = await requestJson(started.baseUrl, "/api/award-alerts/operations/run-evaluator", {
      method: "POST",
    })
    expect(response.response.status).toBe(400)
    expect(response.body).toEqual({
      error: {
        code: "bad_request",
        message: "scheduler offline",
      },
    })
  })

  it("normalizes malformed JSON, non-object JSON bodies, and unknown routes", async () => {
    const service = {
      listAlerts: vi.fn(async () => []),
      getAlert: vi.fn(async () => undefined),
      createAlert: vi.fn(async () => alert),
      updateAlert: vi.fn(async () => updatedAlert),
      pauseAlert: vi.fn(async () => ({ ...alert, active: false })),
      resumeAlert: vi.fn(async () => ({ ...alert, active: true })),
      deleteAlert: vi.fn(async () => alert),
      previewAlert: vi.fn(async () => preview),
      getAlertRuns: vi.fn(async () => [{ id: "run-1" }]),
      getAlertNotifications: vi.fn(async () => [{ id: "event-1" }]),
      getStatus: vi.fn(() => status),
      triggerEvaluatorRun: vi.fn(async () => ({ started: true })),
      triggerNotifierRun: vi.fn(async () => ({ started: true })),
    }

    const started = startServer(service)
    server = started.server

    let response = await fetch(`${started.baseUrl()}/api/award-alerts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{\"program\":",
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        code: "bad_request",
        message: "Malformed JSON body",
      },
    })

    response = await fetch(`${started.baseUrl()}/api/award-alerts/operations/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify("not-an-object"),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: {
        code: "bad_request",
        message: "request body must be a JSON object",
      },
    })

    response = await fetch(`${started.baseUrl()}/api/does-not-exist`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: {
        code: "not_found",
        message: "Route not found",
      },
    })
  })
})
