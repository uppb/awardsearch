import { existsSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("retired Alaska Firestore modules", () => {
  it("removes the retired Firestore repository file", () => {
    expect(existsSync("awardwiz/backend/alaska-alerts/firestore-repository.ts")).toBe(false)
  })
})
