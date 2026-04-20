import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const retiredModulePaths = [
  "../../../awardwiz/backend/alaska-alerts/firebase-admin.ts",
  "../../../awardwiz/backend/alaska-alerts/firestore-repository.ts",
  "../../../awardwiz/backend/alaska-alerts/scheduler.ts",
  "../../../awardwiz/workers/alaska-alerts-evaluator.ts",
  "../../../awardwiz/workers/alaska-alerts-notifier.ts",
].map(path => fileURLToPath(new URL(path, import.meta.url)))

describe("retired Alaska Firestore modules", () => {
  it("removes the retired Firestore module files", () => {
    for (const path of retiredModulePaths)
      expect(existsSync(path)).toBe(false)
  })
})
