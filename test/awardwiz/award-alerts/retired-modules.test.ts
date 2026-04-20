import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const retiredModulePaths = [
  "../../../awardwiz/backend/alaska-alerts/alaska-search.ts",
  "../../../awardwiz/backend/alaska-alerts/date-scope.ts",
  "../../../awardwiz/backend/alaska-alerts/evaluator.ts",
  "../../../awardwiz/backend/alaska-alerts/matcher.ts",
  "../../../awardwiz/backend/alaska-alerts/notifier.ts",
  "../../../awardwiz/backend/alaska-alerts/types.ts",
  "../../../awardwiz/backend/alaska-alerts/firebase-admin.ts",
  "../../../awardwiz/backend/alaska-alerts/firestore-repository.ts",
  "../../../awardwiz/backend/alaska-alerts/scheduler.ts",
  "../../../awardwiz/workers/alaska-alerts-evaluator.ts",
  "../../../awardwiz/workers/alaska-alerts-notifier.ts",
].map(path => fileURLToPath(new URL(path, import.meta.url)))

describe("retired Alaska modules", () => {
  it("removes the retired legacy runtime and Firestore module files", () => {
    for (const path of retiredModulePaths)
      expect(existsSync(path)).toBe(false)
  })
})
