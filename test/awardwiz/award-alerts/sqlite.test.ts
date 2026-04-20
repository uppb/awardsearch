import { describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { openAwardAlertsDb } from "../../../awardwiz/backend/award-alerts/sqlite.js"

describe("openAwardAlertsDb", () => {
  it("creates the expected schema and pragmas", () => {
    const dir = mkdtempSync(join(tmpdir(), "award-alerts-sqlite-"))
    const dbPath = join(dir, "alerts.sqlite")

    const db = openAwardAlertsDb(dbPath)
    try {
      const getNames = (type: "table" | "index") =>
        (db.prepare(`SELECT name FROM sqlite_master WHERE type = '${type}' ORDER BY name`).all() as { name: string }[])
          .map(({ name }) => name)
          .filter((name) => !name.startsWith("sqlite_autoindex_"))
          .slice()
          .sort()

      expect(db).toBeInstanceOf(Database)
      expect({
        journal_mode: db.pragma("journal_mode", { simple: true }),
        foreign_keys: db.pragma("foreign_keys", { simple: true }),
        user_version: db.pragma("user_version", { simple: true }),
      }).toStrictEqual({
        journal_mode: "wal",
        foreign_keys: 1,
        user_version: 1,
      })
      expect(getNames("table")).toStrictEqual([
        "award_alert_runs",
        "award_alert_state",
        "award_alerts",
        "notification_events",
      ].slice().sort())
      expect(getNames("index")).toStrictEqual([
        "idx_award_alert_runs_alert_id_completed_at",
        "idx_award_alerts_active_next_check_at",
        "idx_notification_events_status_claimed_at_created_at",
      ].slice().sort())
      expect((db.prepare("PRAGMA foreign_key_list('award_alert_state')").all() as { table: string; on_delete: string }[])
        .map(({ table, on_delete }) => ({ table, on_delete })))
        .toStrictEqual([
          { table: "award_alerts", on_delete: "CASCADE" },
        ])
    } finally {
      db.close()
    }
  })

  it("does not replay migrations on reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "award-alerts-sqlite-"))
    const dbPath = join(dir, "alerts.sqlite")

    const initialDb = openAwardAlertsDb(dbPath)
    initialDb.close()

    const reopenedDb = openAwardAlertsDb(dbPath)
    try {
      expect(reopenedDb.pragma("user_version", { simple: true })).toBe(1)
      expect(reopenedDb.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get() as { count: number })
        .toStrictEqual({ count: 4 })
    } finally {
      reopenedDb.close()
    }
  })
})
