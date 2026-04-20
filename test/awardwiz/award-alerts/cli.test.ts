import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openAwardAlertsDb } from "../../../awardwiz/backend/award-alerts/sqlite.js"
import { SqliteAwardAlertsRepository } from "../../../awardwiz/backend/award-alerts/sqlite-repository.js"
import { runCli } from "../../../awardwiz/backend/award-alerts/cli.js"

const openCliHarness = () => {
  const db = openAwardAlertsDb(join(mkdtempSync(join(tmpdir(), "award-alerts-cli-")), "alerts.sqlite"))
  const repository = new SqliteAwardAlertsRepository(db)
  const stdout: string[] = []
  const stderr: string[] = []

  return {
    db,
    repository,
    stdout,
    stderr,
    run: (argv: string[], now = "2026-04-19T00:00:00.000Z") => runCli(argv, {
      now: () => new Date(now),
      generateId: () => "alert-test-id",
      openRepository: () => ({ repository, close: () => {} }),
      stdout: line => stdout.push(line),
      stderr: line => stderr.push(line),
    }),
  }
}

describe("runCli", () => {
  const cleanup = new Set<() => void>()

  afterEach(() => {
    for (const close of cleanup)
      close()
    cleanup.clear()
  })

  it("creates a single-date alert and lists it", async () => {
    const harness = openCliHarness()
    cleanup.add(() => harness.db.close())

    await expect(harness.run([
      "create",
      "--program", "alaska",
      "--user-id", "user-1",
      "--origin", "SFO",
      "--destination", "HNL",
      "--date", "2026-07-01",
      "--cabin", "business",
      "--nonstop-only",
      "--max-miles", "90000",
      "--max-cash", "10.5",
      "--poll-interval-minutes", "30",
      "--min-notification-interval-minutes", "120",
    ])).resolves.toBe(0)

    expect(harness.stdout.join("\n")).toContain("Created alert alert-test-id")

    harness.stdout.length = 0
    await expect(harness.run(["list"])).resolves.toBe(0)

    expect(harness.stdout.join("\n")).toContain("alert-test-id")
    expect(harness.stdout.join("\n")).toContain("alaska")
    expect(harness.stdout.join("\n")).toContain("SFO-HNL")
    expect(harness.stdout.join("\n")).toContain("2026-07-01")
    expect(harness.stdout.join("\n")).toContain("active")
  })

  it("creates a date-range alert and shows the persisted details", async () => {
    const harness = openCliHarness()
    cleanup.add(() => harness.db.close())

    await harness.run([
      "create",
      "--program", "alaska",
      "--user-id", "user-2",
      "--origin", "SEA",
      "--destination", "OGG",
      "--start-date", "2026-08-10",
      "--end-date", "2026-08-12",
      "--cabin", "economy",
    ])

    harness.stdout.length = 0
    await expect(harness.run(["show", "alert-test-id"])).resolves.toBe(0)

    expect(harness.stdout.join("\n")).toContain("id: alert-test-id")
    expect(harness.stdout.join("\n")).toContain("route: SEA-OGG")
    expect(harness.stdout.join("\n")).toContain("date_range 2026-08-10..2026-08-12")
    expect(harness.stdout.join("\n")).toContain("user: user-2")
    expect(harness.stdout.join("\n")).toContain("state: no evaluation yet")
  })

  it("pauses, resumes, and deletes alerts through repository-backed commands", async () => {
    const harness = openCliHarness()
    cleanup.add(() => harness.db.close())

    await harness.run([
      "create",
      "--program", "alaska",
      "--user-id", "user-3",
      "--origin", "PDX",
      "--destination", "LIH",
      "--date", "2026-09-01",
      "--cabin", "first",
    ])

    harness.stdout.length = 0
    await expect(harness.run(["pause", "alert-test-id"], "2026-04-19T01:00:00.000Z")).resolves.toBe(0)
    expect(harness.stdout.join("\n")).toContain("Paused alert alert-test-id")
    expect(harness.repository.getAlert("alert-test-id")).toMatchObject({
      active: false,
      nextCheckAt: undefined,
    })

    harness.stdout.length = 0
    await expect(harness.run(["resume", "alert-test-id"], "2026-04-19T02:00:00.000Z")).resolves.toBe(0)
    expect(harness.stdout.join("\n")).toContain("Resumed alert alert-test-id")
    expect(harness.repository.getAlert("alert-test-id")).toMatchObject({
      active: true,
      nextCheckAt: "2026-04-19T02:00:00.000Z",
    })

    harness.stdout.length = 0
    await expect(harness.run(["delete", "alert-test-id"])).resolves.toBe(0)
    expect(harness.stdout.join("\n")).toContain("Deleted alert alert-test-id")

    harness.stdout.length = 0
    await expect(harness.run(["list"])).resolves.toBe(0)
    expect(harness.stdout.join("\n")).toContain("No alerts found")
  })

  it("rejects malformed numeric values and invalid dates during create", async () => {
    const harness = openCliHarness()
    cleanup.add(() => harness.db.close())

    await expect(harness.run([
      "create",
      "--program", "alaska",
      "--user-id", "user-1",
      "--origin", "SFO",
      "--destination", "HNL",
      "--date", "2026-07-01",
      "--cabin", "business",
      "--poll-interval-minutes", "30.5",
    ])).resolves.toBe(1)
    expect(harness.stderr.join("\n")).toContain("Invalid positive integer for --poll-interval-minutes: 30.5")

    harness.stderr.length = 0
    await expect(harness.run([
      "create",
      "--program", "alaska",
      "--user-id", "user-1",
      "--origin", "SFO",
      "--destination", "HNL",
      "--date", "2026-07-01",
      "--cabin", "business",
      "--min-notification-interval-minutes", "1e3",
    ])).resolves.toBe(1)
    expect(harness.stderr.join("\n")).toContain("Invalid positive integer for --min-notification-interval-minutes: 1e3")

    harness.stderr.length = 0
    await expect(harness.run([
      "create",
      "--program", "alaska",
      "--user-id", "user-1",
      "--origin", "SFO",
      "--destination", "HNL",
      "--date", "2026-07-01",
      "--cabin", "business",
      "--max-miles", "30abc",
    ])).resolves.toBe(1)
    expect(harness.stderr.join("\n")).toContain("Invalid non-negative integer for --max-miles: 30abc")

    harness.stderr.length = 0
    await expect(harness.run([
      "create",
      "--program", "alaska",
      "--user-id", "user-1",
      "--origin", "SFO",
      "--destination", "HNL",
      "--date", "2026-07-01",
      "--cabin", "business",
      "--max-cash", "-1",
    ])).resolves.toBe(1)
    expect(harness.stderr.join("\n")).toContain("Invalid non-negative number for --max-cash: -1")

    harness.stderr.length = 0
    await expect(harness.run([
      "create",
      "--program", "alaska",
      "--user-id", "user-1",
      "--origin", "SFO",
      "--destination", "HNL",
      "--date", "2026-02-31",
      "--cabin", "business",
    ])).resolves.toBe(1)
    expect(harness.stderr.join("\n")).toContain("Invalid date for --date: 2026-02-31")
  })

  it("rejects unknown flags and malformed non-create commands", async () => {
    const harness = openCliHarness()
    cleanup.add(() => harness.db.close())

    await expect(harness.run([
      "create",
      "--program", "alaska",
      "--user-id", "user-1",
      "--origin", "SFO",
      "--destination", "HNL",
      "--date", "2026-07-01",
      "--cabin", "business",
      "--bogus", "x",
    ])).resolves.toBe(1)
    expect(harness.stderr.join("\n")).toContain("Unknown option: --bogus")

    harness.stderr.length = 0
    await expect(harness.run(["list", "extra"])).resolves.toBe(1)
    expect(harness.stderr.join("\n")).toContain("Command list does not accept positional arguments")

    harness.stderr.length = 0
    await expect(harness.run(["pause"])).resolves.toBe(1)
    expect(harness.stderr.join("\n")).toContain("Missing id for pause")

    harness.stderr.length = 0
    await expect(harness.run(["pause", "missing-id", "extra"])).resolves.toBe(1)
    expect(harness.stderr.join("\n")).toContain("Command pause accepts exactly one id")

    harness.stderr.length = 0
    await expect(harness.run(["show", "missing-id"])).resolves.toBe(1)
    expect(harness.stderr.join("\n")).toContain("award alert not found: missing-id")

    harness.stderr.length = 0
    await expect(harness.run(["wat"])).resolves.toBe(1)
    expect(harness.stderr.join("\n")).toContain("Unsupported command: wat")
  })
})
