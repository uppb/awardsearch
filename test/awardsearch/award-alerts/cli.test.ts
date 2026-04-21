import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { startAwardAlertsService } from "../../../awardsearch/workers/award-alerts-service.js"

const readJson = async (response: Response): Promise<unknown> =>
  await response.json() as unknown

describe("award alerts service runtime", () => {
  it("starts the unified service and exposes status without the legacy CLI surface", async () => {
    const databasePath = join(mkdtempSync(join(tmpdir(), "award-alerts-cli-test-")), "alerts.sqlite")
    const service = await startAwardAlertsService({
      databasePath,
      port: 0,
      evaluatorIntervalMs: 60 * 60 * 1000,
      notifierIntervalMs: 60 * 60 * 1000,
      webhookUrl: "https://discord.test/webhook",
      providers: {},
    })

    try {
      const response = await fetch(`${service.baseUrl}/api/award-alerts/status`)
      expect(response.status).toBe(200)
      const status = await readJson(response) as {
        databasePath: string
        evaluator: { intervalMs: number }
        notifier: { intervalMs: number }
      }
      expect(status.databasePath).toBe(databasePath)
      expect(status.evaluator.intervalMs).toBe(60 * 60 * 1000)
      expect(status.notifier.intervalMs).toBe(60 * 60 * 1000)
    } finally {
      await service.close()
    }
  })
})
