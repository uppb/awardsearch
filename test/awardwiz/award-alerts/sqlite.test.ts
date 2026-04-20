import { describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { openAwardAlertsDb } from "../../../awardwiz/backend/award-alerts/sqlite.js"

describe("openAwardAlertsDb", () => {
  it("creates the expected tables and indexes", () => {
    const dir = mkdtempSync(join(tmpdir(), "award-alerts-sqlite-"))
    const dbPath = join(dir, "alerts.sqlite")

    const db = openAwardAlertsDb(dbPath)
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]
      const indexes = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name").all() as { name: string }[])
        .filter(({ name }) => !name.startsWith("sqlite_autoindex_"))

      expect(db).toBeInstanceOf(Database)
      expect(tables.map(({ name }) => name)).toStrictEqual([
        "award_alert_runs",
        "award_alert_state",
        "award_alerts",
        "notification_events",
      ])
      expect(indexes.map(({ name }) => name)).toStrictEqual([
        "idx_award_alert_runs_alert_id_completed_at",
        "idx_award_alerts_active_next_check_at",
        "idx_notification_events_status_claimed_at_created_at",
      ])
    } finally {
      db.close()
    }
  })
})
