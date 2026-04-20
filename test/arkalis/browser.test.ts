import { describe, expect, it, vi } from "vitest"
import { resolveChromeLaunch } from "../../arkalis/browser.js"

describe("resolveChromeLaunch", () => {
  it("uses the top-level launch export when present", () => {
    const launch = vi.fn()

    expect(resolveChromeLaunch({ launch })).toBe(launch)
  })

  it("falls back to default.launch for runtimes that wrap CommonJS modules", () => {
    const launch = vi.fn()

    expect(resolveChromeLaunch({ default: { launch } })).toBe(launch)
  })

  it("throws a clear error when chrome-launcher does not expose launch", () => {
    expect(() => resolveChromeLaunch({})).toThrow("chrome-launcher module does not expose launch()")
  })
})
