import { describe, expect, it } from "vitest"
import {
  ensureChromePath,
  findChromePathInPlaywrightCache,
  resolveChromePath,
} from "../../arkalis/browser.js"

describe("chrome path resolution", () => {
  it("keeps an existing CHROME_PATH override", async () => {
    const env = {
      CHROME_PATH: "/custom/chrome",
      PATH: "/usr/bin:/bin",
    }

    await expect(resolveChromePath({
      env,
      access: async () => undefined,
      readdir: async () => [],
    })).resolves.toBe("/custom/chrome")

    await expect(ensureChromePath({
      env,
      access: async () => undefined,
      readdir: async () => [],
    })).resolves.toBe("/custom/chrome")

    expect(env.CHROME_PATH).toBe("/custom/chrome")
  })

  it("prefers a Chrome binary found on PATH", async () => {
    const env = {
      PATH: "/usr/local/bin:/usr/bin",
    }

    const accessible = new Set([
      "/usr/bin/chromium",
    ])

    await expect(resolveChromePath({
      env,
      access: async (targetPath: string) => {
        if (!accessible.has(targetPath))
          throw new Error("missing")
      },
      readdir: async () => [],
    })).resolves.toBe("/usr/bin/chromium")
  })

  it("falls back to the Playwright browser cache when PATH discovery fails", async () => {
    const env = {
      PATH: "/usr/local/bin:/usr/bin",
    }

    await expect(resolveChromePath({
      env,
      access: async (targetPath: string) => {
        if (targetPath === "/ms-playwright")
          return

        throw new Error("missing")
      },
      readdir: async (targetPath: string) => {
        switch (targetPath) {
          case "/ms-playwright":
            return [{ name: "chromium-1208", isDirectory: () => true, isFile: () => false }]
          case "/ms-playwright/chromium-1208":
            return [{ name: "chrome-linux64", isDirectory: () => true, isFile: () => false }]
          case "/ms-playwright/chromium-1208/chrome-linux64":
            return [{ name: "chrome", isDirectory: () => false, isFile: () => true }]
          default:
            return []
        }
      },
    })).resolves.toBe("/ms-playwright/chromium-1208/chrome-linux64/chrome")
  })

  it("returns undefined when no browser binary can be discovered", async () => {
    await expect(resolveChromePath({
      env: {
        PATH: "/usr/local/bin:/usr/bin",
      },
      access: async () => {
        throw new Error("missing")
      },
      readdir: async () => [],
    })).resolves.toBeUndefined()
  })

  it("searches the Playwright cache recursively for a chrome binary", async () => {
    await expect(findChromePathInPlaywrightCache("/ms-playwright", {
      readdir: async (targetPath: string) => {
        switch (targetPath) {
          case "/ms-playwright":
            return [{ name: "shared", isDirectory: () => true, isFile: () => false }]
          case "/ms-playwright/shared":
            return [{ name: "chromium-1208", isDirectory: () => true, isFile: () => false }]
          case "/ms-playwright/shared/chromium-1208":
            return [{ name: "chrome-linux64", isDirectory: () => true, isFile: () => false }]
          case "/ms-playwright/shared/chromium-1208/chrome-linux64":
            return [{ name: "chrome", isDirectory: () => false, isFile: () => true }]
          default:
            return []
        }
      },
    })).resolves.toBe("/ms-playwright/shared/chromium-1208/chrome-linux64/chrome")
  })
})
