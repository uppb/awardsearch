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
    } finally {
      db.close()
    }
  })

  it("uses cascading foreign keys for child tables", () => {
    const dir = mkdtempSync(join(tmpdir(), "award-alerts-sqlite-"))
    const dbPath = join(dir, "alerts.sqlite")

    const db = openAwardAlertsDb(dbPath)
    try {
      const getForeignKeys = (table: string) =>
        (db.prepare(`PRAGMA foreign_key_list('${table}')`).all() as { table: string; on_delete: string }[])
          .map(({ table, on_delete }) => ({ table, on_delete }))

      expect(getForeignKeys("award_alert_state")).toStrictEqual([
        { table: "award_alerts", on_delete: "CASCADE" },
      ])
      expect(getForeignKeys("award_alert_runs")).toStrictEqual([
        { table: "award_alerts", on_delete: "CASCADE" },
      ])
      expect(getForeignKeys("notification_events")).toStrictEqual([
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

  it("cascades child rows when an alert is deleted", () => {
    const dir = mkdtempSync(join(tmpdir(), "award-alerts-sqlite-"))
    const dbPath = join(dir, "alerts.sqlite")
    const db = openAwardAlertsDb(dbPath)

    try {
      db.prepare(`
        INSERT INTO award_alerts (
          id, program, user_id, origin, destination, date_mode, date, start_date, end_date, cabin,
          nonstop_only, max_miles, max_cash, active, poll_interval_minutes, min_notification_interval_minutes,
          last_checked_at, next_check_at, created_at, updated_at
        ) VALUES (
          @id, @program, @user_id, @origin, @destination, @date_mode, @date, @start_date, @end_date, @cabin,
          @nonstop_only, @max_miles, @max_cash, @active, @poll_interval_minutes, @min_notification_interval_minutes,
          @last_checked_at, @next_check_at, @created_at, @updated_at
        )
      `).run({
        id: "alert-1",
        program: "aa",
        user_id: "user-1",
        origin: "SFO",
        destination: "HNL",
        date_mode: "date",
        date: "2026-04-19",
        start_date: null,
        end_date: null,
        cabin: "economy",
        nonstop_only: 1,
        max_miles: null,
        max_cash: null,
        active: 1,
        poll_interval_minutes: 30,
        min_notification_interval_minutes: 60,
        last_checked_at: null,
        next_check_at: null,
        created_at: "2026-04-19T00:00:00Z",
        updated_at: "2026-04-19T00:00:00Z",
      })
      db.prepare(`
        INSERT INTO award_alert_state (alert_id, state, updated_at)
        VALUES (?, ?, ?)
      `).run("alert-1", "ready", "2026-04-19T00:00:00Z")
      db.prepare(`
        INSERT INTO award_alert_runs (id, alert_id, started_at, completed_at, status, error)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("run-1", "alert-1", "2026-04-19T00:00:00Z", null, "running", null)
      db.prepare(`
        INSERT INTO notification_events (id, alert_id, status, claimed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run("event-1", "alert-1", "pending", null, "2026-04-19T00:00:00Z", "2026-04-19T00:00:00Z")

      db.prepare("DELETE FROM award_alerts WHERE id = ?").run("alert-1")

      expect(db.prepare("SELECT COUNT(*) AS count FROM award_alert_state").get() as { count: number }).toStrictEqual({ count: 0 })
      expect(db.prepare("SELECT COUNT(*) AS count FROM award_alert_runs").get() as { count: number }).toStrictEqual({ count: 0 })
      expect(db.prepare("SELECT COUNT(*) AS count FROM notification_events").get() as { count: number }).toStrictEqual({ count: 0 })
    } finally {
      db.close()
    }
  })
})
