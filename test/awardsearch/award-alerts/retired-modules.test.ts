import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const retiredModulePaths = [
  "../../../awardsearch/backend/award-alerts/cli.ts",
  "../../../awardsearch/backend/alaska-alerts/alaska-search.ts",
  "../../../awardsearch/backend/alaska-alerts/date-scope.ts",
  "../../../awardsearch/backend/alaska-alerts/evaluator.ts",
  "../../../awardsearch/backend/alaska-alerts/matcher.ts",
  "../../../awardsearch/backend/alaska-alerts/notifier.ts",
  "../../../awardsearch/backend/alaska-alerts/types.ts",
  "../../../awardsearch/backend/alaska-alerts/firebase-admin.ts",
  "../../../awardsearch/backend/alaska-alerts/firestore-repository.ts",
  "../../../awardsearch/backend/alaska-alerts/scheduler.ts",
  "../../../awardsearch/workers/alaska-alerts-evaluator.ts",
  "../../../awardsearch/workers/alaska-alerts-notifier.ts",
  "../../../awardsearch/workers/award-alerts-evaluator.ts",
  "../../../awardsearch/workers/award-alerts-notifier.ts",
].map(path => fileURLToPath(new URL(path, import.meta.url)))

describe("retired award alerts runtime surfaces", () => {
  it("removes the retired legacy and runtime module files", () => {
    for (const path of retiredModulePaths)
      expect(existsSync(path)).toBe(false)
  })
})
