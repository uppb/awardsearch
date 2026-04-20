import { describe, expect, it } from "vitest"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { openAwardAlertsDb } from "../../../awardwiz/backend/award-alerts/sqlite.js"

const normalizeSql = (sql: string | null) =>
  (() => {
    if (!sql)
      return ""

    let normalized = sql.trim().toLowerCase()
    if (normalized.endsWith(";"))
      normalized = normalized.slice(0, -1).trimEnd()

    let result = ""
    let pendingSpace = false
    for (const character of normalized) {
      if (
        character === " "
        || character === "\n"
        || character === "\r"
        || character === "\t"
        || character === "\f"
        || character === "\v"
      ) {
        pendingSpace = true
        continue
      }

      if (pendingSpace && result.length > 0)
        result += " "

      pendingSpace = false
      result += character
    }

    return result.replaceAll("( ", "(").replaceAll(" )", ")")
  })()

const getSqlByName = (db: Database.Database, type: "table" | "index") =>
  Object.fromEntries(
    (db.prepare("SELECT name, sql FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name").all(type) as { name: string; sql: string | null }[])
      .map(({ name, sql }) => [name, normalizeSql(sql)]),
  )

const seedDriftedSchema = (dbPath: string, userVersion: 0 | 1) => {
  const db = new Database(dbPath)
  try {
    db.exec(`
      CREATE TABLE award_alerts (
        id TEXT PRIMARY KEY
      );
    `)
    db.pragma(`user_version = ${userVersion}`)
  } finally {
    db.close()
  }
}

const seedLaterSchemaObject = (dbPath: string, userVersion: 0 | 1) => {
  const db = new Database(dbPath)
  try {
    db.exec(`
      CREATE TABLE award_alert_runs (
        id TEXT
      );
    `)
    db.pragma(`user_version = ${userVersion}`)
  } finally {
    db.close()
  }
}

describe("openAwardAlertsDb", () => {
  it("creates the expected v1 schema and pragmas", () => {
    const dir = mkdtempSync(join(tmpdir(), "award-alerts-sqlite-"))
    const dbPath = join(dir, "alerts.sqlite")

    const db = openAwardAlertsDb(dbPath)
    try {
      expect({
        journal_mode: db.pragma("journal_mode", { simple: true }),
        foreign_keys: db.pragma("foreign_keys", { simple: true }),
        user_version: db.pragma("user_version", { simple: true }),
      }).toStrictEqual({
        journal_mode: "wal",
        foreign_keys: 1,
        user_version: 1,
      })
      expect(getSqlByName(db, "table")).toStrictEqual({
        award_alert_runs: normalizeSql(`
          CREATE TABLE award_alert_runs (
            id TEXT PRIMARY KEY,
            alert_id TEXT NOT NULL REFERENCES award_alerts(id) ON DELETE CASCADE,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            searched_dates TEXT,
            scrape_count INTEGER NOT NULL DEFAULT 0 CHECK (scrape_count >= 0),
            scrape_success_count INTEGER NOT NULL DEFAULT 0 CHECK (scrape_success_count >= 0),
            scrape_error_count INTEGER NOT NULL DEFAULT 0 CHECK (scrape_error_count >= 0),
            matched_result_count INTEGER NOT NULL DEFAULT 0 CHECK (matched_result_count >= 0),
            has_match INTEGER NOT NULL CHECK (has_match IN (0, 1)),
            error_summary TEXT
          )
        `),
        award_alert_state: normalizeSql(`
          CREATE TABLE award_alert_state (
            alert_id TEXT PRIMARY KEY REFERENCES award_alerts(id) ON DELETE CASCADE,
            has_match INTEGER NOT NULL CHECK (has_match IN (0, 1)),
            matched_dates TEXT,
            matching_results TEXT,
            best_match_summary TEXT,
            match_fingerprint TEXT,
            last_match_at TEXT,
            last_notified_at TEXT,
            last_error_at TEXT,
            last_error_message TEXT,
            updated_at TEXT NOT NULL
          )
        `),
        award_alerts: normalizeSql(`
          CREATE TABLE award_alerts (
            id TEXT PRIMARY KEY,
            program TEXT NOT NULL,
            user_id TEXT NOT NULL,
            origin TEXT NOT NULL,
            destination TEXT NOT NULL,
            date_mode TEXT NOT NULL CHECK (date_mode IN ('single_date', 'date_range')),
            date TEXT,
            start_date TEXT,
            end_date TEXT,
            cabin TEXT NOT NULL CHECK (cabin IN ('economy', 'business', 'first')),
            nonstop_only INTEGER NOT NULL CHECK (nonstop_only IN (0, 1)),
            max_miles INTEGER,
            max_cash REAL,
            active INTEGER NOT NULL CHECK (active IN (0, 1)),
            poll_interval_minutes INTEGER NOT NULL CHECK (poll_interval_minutes > 0),
            min_notification_interval_minutes INTEGER NOT NULL CHECK (min_notification_interval_minutes > 0),
            last_checked_at TEXT,
            next_check_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            CHECK (
              (
                (date_mode = 'single_date' AND date IS NOT NULL AND start_date IS NULL AND end_date IS NULL)
                OR
                (date_mode = 'date_range' AND date IS NULL AND start_date IS NOT NULL AND end_date IS NOT NULL)
              )
              AND (active = 0 OR next_check_at IS NOT NULL)
            )
          )
        `),
        notification_events: normalizeSql(`
          CREATE TABLE notification_events (
            id TEXT PRIMARY KEY,
            alert_id TEXT NOT NULL REFERENCES award_alerts(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'delivered_unconfirmed')),
            claimed_at TEXT,
            claim_token TEXT,
            attempted_at TEXT,
            payload TEXT NOT NULL,
            sent_at TEXT,
            failure_reason TEXT
          )
        `),
      })
      expect(getSqlByName(db, "index")).toStrictEqual({
        idx_award_alert_runs_alert_id_completed_at: normalizeSql(`
          CREATE INDEX idx_award_alert_runs_alert_id_completed_at
          ON award_alert_runs(alert_id, completed_at)
        `),
        idx_award_alerts_active_next_check_at: normalizeSql(`
          CREATE INDEX idx_award_alerts_active_next_check_at
          ON award_alerts(active, next_check_at)
        `),
        idx_notification_events_status_claimed_at_created_at: normalizeSql(`
          CREATE INDEX idx_notification_events_status_claimed_at_created_at
          ON notification_events(status, claimed_at, created_at)
        `),
      })
    } finally {
      db.close()
    }
  })

  it("requires active alerts to have next_check_at", () => {
    const dir = mkdtempSync(join(tmpdir(), "award-alerts-sqlite-"))
    const dbPath = join(dir, "alerts.sqlite")
    const db = openAwardAlertsDb(dbPath)

    try {
      expect(() => db.prepare(`
        INSERT INTO award_alerts (
          id, program, user_id, origin, destination, date_mode, date, start_date, end_date, cabin,
          nonstop_only, max_miles, max_cash, active, poll_interval_minutes, min_notification_interval_minutes,
          last_checked_at, next_check_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        "alert-1",
        "any-provider",
        "user-1",
        "SFO",
        "HNL",
        "single_date",
        "2026-04-19",
        null,
        null,
        "economy",
        1,
        null,
        null,
        1,
        30,
        60,
        null,
        null,
        "2026-04-19T00:00:00Z",
        "2026-04-19T00:00:00Z",
      )).toThrow("CHECK constraint failed")
    } finally {
      db.close()
    }
  })

  it("rejects databases newer than the latest supported version", () => {
    const dir = mkdtempSync(join(tmpdir(), "award-alerts-sqlite-"))
    const dbPath = join(dir, "alerts.sqlite")
    seedDriftedSchema(dbPath, 1)

    const db = new Database(dbPath)
    try {
      db.pragma("user_version = 2")
    } finally {
      db.close()
    }

    expect(() => openAwardAlertsDb(dbPath)).toThrow("award alerts SQLite database version 2 is newer than the latest supported version 1")
  })

  it("rejects a drifted schema that is already marked version 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "award-alerts-sqlite-"))
    const dbPath = join(dir, "alerts.sqlite")
    seedDriftedSchema(dbPath, 1)

    expect(() => openAwardAlertsDb(dbPath)).toThrow("award alerts SQLite schema does not match v1")
  })

  it("rolls back partial migration work when a later table already exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "award-alerts-sqlite-"))
    const dbPath = join(dir, "alerts.sqlite")
    seedLaterSchemaObject(dbPath, 0)

    expect(() => openAwardAlertsDb(dbPath)).toThrow("table award_alert_runs already exists")

    const db = new Database(dbPath)
    try {
      expect(db.pragma("user_version", { simple: true })).toBe(0)
      expect(getSqlByName(db, "table")).toStrictEqual({
        award_alert_runs: normalizeSql(`
          CREATE TABLE award_alert_runs (
            id TEXT
          )
        `),
      })
      expect(getSqlByName(db, "index")).toStrictEqual({})
    } finally {
      db.close()
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
        program: "any-provider",
        user_id: "user-1",
        origin: "SFO",
        destination: "HNL",
        date_mode: "single_date",
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
        next_check_at: "2026-04-20T00:00:00Z",
        created_at: "2026-04-19T00:00:00Z",
        updated_at: "2026-04-19T00:00:00Z",
      })
      db.prepare(`
        INSERT INTO award_alert_state (
          alert_id, has_match, matched_dates, matching_results, best_match_summary, match_fingerprint,
          last_match_at, last_notified_at, last_error_at, last_error_message, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "alert-1",
        1,
        "[]",
        "[]",
        null,
        null,
        null,
        null,
        null,
        null,
        "2026-04-19T00:00:00Z",
      )
      db.prepare(`
        INSERT INTO award_alert_runs (
          id, alert_id, started_at, completed_at, searched_dates, scrape_count, scrape_success_count,
          scrape_error_count, matched_result_count, has_match, error_summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "run-1",
        "alert-1",
        "2026-04-19T00:00:00Z",
        null,
        "[]",
        1,
        1,
        0,
        1,
        1,
        null,
      )
      db.prepare(`
        INSERT INTO notification_events (
          id, alert_id, user_id, created_at, status, claimed_at, claim_token, attempted_at, payload, sent_at, failure_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "event-1",
        "alert-1",
        "user-1",
        "2026-04-19T00:00:00Z",
        "pending",
        null,
        null,
        null,
        "{}",
        null,
        null,
      )

      db.prepare("DELETE FROM award_alerts WHERE id = ?").run("alert-1")

      expect({
        award_alert_state: db.prepare("SELECT COUNT(*) AS count FROM award_alert_state").get() as { count: number },
        award_alert_runs: db.prepare("SELECT COUNT(*) AS count FROM award_alert_runs").get() as { count: number },
        notification_events: db.prepare("SELECT COUNT(*) AS count FROM notification_events").get() as { count: number },
      }).toStrictEqual({
        award_alert_state: { count: 0 },
        award_alert_runs: { count: 0 },
        notification_events: { count: 0 },
      })
    } finally {
      db.close()
    }
  })
})
