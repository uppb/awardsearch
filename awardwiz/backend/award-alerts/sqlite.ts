import Database from "better-sqlite3"

const MIGRATION_V1 = (db: Database.Database) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS award_alerts (
      id TEXT PRIMARY KEY,
      program TEXT NOT NULL,
      user_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      date_mode TEXT NOT NULL,
      date TEXT,
      start_date TEXT,
      end_date TEXT,
      cabin TEXT NOT NULL,
      nonstop_only INTEGER NOT NULL,
      max_miles INTEGER,
      max_cash REAL,
      active INTEGER NOT NULL,
      poll_interval_minutes INTEGER NOT NULL,
      min_notification_interval_minutes INTEGER NOT NULL,
      last_checked_at TEXT,
      next_check_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_award_alerts_active_next_check_at
    ON award_alerts(active, next_check_at);

    CREATE TABLE IF NOT EXISTS award_alert_state (
      alert_id TEXT PRIMARY KEY REFERENCES award_alerts(id) ON DELETE CASCADE,
      state TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS award_alert_runs (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES award_alerts(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL,
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_award_alert_runs_alert_id_completed_at
    ON award_alert_runs(alert_id, completed_at);

    CREATE TABLE IF NOT EXISTS notification_events (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL REFERENCES award_alerts(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      claimed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notification_events_status_claimed_at_created_at
    ON notification_events(status, claimed_at, created_at);
  `)
}

const MIGRATIONS = [
  { version: 1, apply: MIGRATION_V1 },
] as const

const runMigrations = (db: Database.Database) => {
  const currentVersion = db.pragma("user_version", { simple: true }) as number
  for (const migration of MIGRATIONS) {
    if (currentVersion >= migration.version)
      continue

    db.transaction(() => {
      migration.apply(db)
      db.pragma(`user_version = ${migration.version}`)
    })()
  }
}

export const openAwardAlertsDb = (filename: string) => {
  const db = new Database(filename)
  try {
    db.pragma("journal_mode = WAL")
    db.pragma("foreign_keys = ON")
    runMigrations(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
