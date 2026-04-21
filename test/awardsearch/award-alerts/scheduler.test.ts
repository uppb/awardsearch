import { describe, expect, it, vi } from "vitest"
import { claimDueAlerts } from "../../../awardsearch/backend/award-alerts/scheduler.js"

describe("claimDueAlerts", () => {
  it("delegates to the repository with the ISO timestamp and defaults", async () => {
    const repository = {
      claimDueAlerts: vi.fn().mockResolvedValue([{ id: "alert-1" }]),
    }

    await expect(claimDueAlerts(repository, new Date("2026-04-19T06:00:00.000Z"))).resolves.toEqual([{ id: "alert-1" }])

    expect(repository.claimDueAlerts).toHaveBeenCalledWith("2026-04-19T06:00:00.000Z", 100, 5)
  })

  it("passes through custom limit and claim TTL values", async () => {
    const repository = {
      claimDueAlerts: vi.fn().mockResolvedValue([]),
    }

    await claimDueAlerts(repository, new Date("2026-04-19T06:00:00.000Z"), {
      limit: 7,
      claimTtlMinutes: 12,
    })

    expect(repository.claimDueAlerts).toHaveBeenCalledWith("2026-04-19T06:00:00.000Z", 7, 12)
  })
})
