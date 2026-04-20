import Database from "better-sqlite3"

const latestSupportedVersion = 2

const SCHEMA_V1_SQL = `
  CREATE TABLE award_alerts (
    id TEXT PRIMARY KEY NOT NULL,
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
        (
          date_mode = 'single_date'
          AND date IS NOT NULL
          AND start_date IS NULL
          AND end_date IS NULL
        )
        OR
        (
          date_mode = 'date_range'
          AND date IS NULL
          AND start_date IS NOT NULL
          AND end_date IS NOT NULL
        )
      )
      AND (active = 0 OR next_check_at IS NOT NULL)
    )
  );

  CREATE INDEX idx_award_alerts_active_next_check_at
  ON award_alerts(active, next_check_at);

  CREATE TABLE award_alert_state (
    alert_id TEXT PRIMARY KEY NOT NULL REFERENCES award_alerts(id) ON DELETE CASCADE,
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
  );

  CREATE TABLE award_alert_runs (
    id TEXT PRIMARY KEY NOT NULL,
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
  );

  CREATE INDEX idx_award_alert_runs_alert_id_completed_at
  ON award_alert_runs(alert_id, completed_at);

  CREATE TABLE notification_events (
    id TEXT PRIMARY KEY NOT NULL,
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
  );

  CREATE INDEX idx_notification_events_status_claimed_at_created_at
  ON notification_events(status, claimed_at, created_at);
`

const SCHEMA_V2_SQL = `
  CREATE TABLE award_alerts (
    id TEXT PRIMARY KEY NOT NULL,
    program TEXT NOT NULL,
    user_id TEXT,
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
        (
          date_mode = 'single_date'
          AND date IS NOT NULL
          AND start_date IS NULL
          AND end_date IS NULL
        )
        OR
        (
          date_mode = 'date_range'
          AND date IS NULL
          AND start_date IS NOT NULL
          AND end_date IS NOT NULL
        )
      )
      AND (active = 0 OR next_check_at IS NOT NULL)
    )
  );

  CREATE INDEX idx_award_alerts_active_next_check_at
  ON award_alerts(active, next_check_at);

  CREATE TABLE award_alert_state (
    alert_id TEXT PRIMARY KEY NOT NULL REFERENCES award_alerts(id) ON DELETE CASCADE,
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
  );

  CREATE TABLE award_alert_runs (
    id TEXT PRIMARY KEY NOT NULL,
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
  );

  CREATE INDEX idx_award_alert_runs_alert_id_completed_at
  ON award_alert_runs(alert_id, completed_at);

  CREATE TABLE notification_events (
    id TEXT PRIMARY KEY NOT NULL,
    alert_id TEXT NOT NULL REFERENCES award_alerts(id) ON DELETE CASCADE,
    user_id TEXT,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'delivered_unconfirmed')),
    claimed_at TEXT,
    claim_token TEXT,
    attempted_at TEXT,
    payload TEXT NOT NULL,
    sent_at TEXT,
    failure_reason TEXT
  );

  CREATE INDEX idx_notification_events_status_claimed_at_created_at
  ON notification_events(status, claimed_at, created_at);
`

const LEGACY_SCHEMA_OBJECTS = {
  award_alerts: `
    CREATE TABLE award_alerts (
      id TEXT PRIMARY KEY NOT NULL,
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
          (
            date_mode = 'single_date'
            AND date IS NOT NULL
            AND start_date IS NULL
            AND end_date IS NULL
          )
          OR
          (
            date_mode = 'date_range'
            AND date IS NULL
            AND start_date IS NOT NULL
            AND end_date IS NOT NULL
          )
        )
        AND (active = 0 OR next_check_at IS NOT NULL)
      )
    )
  `,
  award_alert_state: `
    CREATE TABLE award_alert_state (
      alert_id TEXT PRIMARY KEY NOT NULL REFERENCES award_alerts(id) ON DELETE CASCADE,
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
  `,
  award_alert_runs: `
    CREATE TABLE award_alert_runs (
      id TEXT PRIMARY KEY NOT NULL,
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
  `,
  notification_events: `
    CREATE TABLE notification_events (
      id TEXT PRIMARY KEY NOT NULL,
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
  `,
  idx_award_alerts_active_next_check_at: `
    CREATE INDEX idx_award_alerts_active_next_check_at
    ON award_alerts(active, next_check_at)
  `,
  idx_award_alert_runs_alert_id_completed_at: `
    CREATE INDEX idx_award_alert_runs_alert_id_completed_at
    ON award_alert_runs(alert_id, completed_at)
  `,
  idx_notification_events_status_claimed_at_created_at: `
    CREATE INDEX idx_notification_events_status_claimed_at_created_at
    ON notification_events(status, claimed_at, created_at)
  `,
} as const

const CURRENT_SCHEMA_OBJECTS = {
  award_alerts: `
    CREATE TABLE award_alerts (
      id TEXT PRIMARY KEY NOT NULL,
      program TEXT NOT NULL,
      user_id TEXT,
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
          (
            date_mode = 'single_date'
            AND date IS NOT NULL
            AND start_date IS NULL
            AND end_date IS NULL
          )
          OR
          (
            date_mode = 'date_range'
            AND date IS NULL
            AND start_date IS NOT NULL
            AND end_date IS NOT NULL
          )
        )
        AND (active = 0 OR next_check_at IS NOT NULL)
      )
    )
  `,
  award_alert_state: `
    CREATE TABLE award_alert_state (
      alert_id TEXT PRIMARY KEY NOT NULL REFERENCES award_alerts(id) ON DELETE CASCADE,
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
  `,
  award_alert_runs: `
    CREATE TABLE award_alert_runs (
      id TEXT PRIMARY KEY NOT NULL,
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
  `,
  notification_events: `
    CREATE TABLE notification_events (
      id TEXT PRIMARY KEY NOT NULL,
      alert_id TEXT NOT NULL REFERENCES award_alerts(id) ON DELETE CASCADE,
      user_id TEXT,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'delivered_unconfirmed')),
      claimed_at TEXT,
      claim_token TEXT,
      attempted_at TEXT,
      payload TEXT NOT NULL,
      sent_at TEXT,
      failure_reason TEXT
    )
  `,
  idx_award_alerts_active_next_check_at: `
    CREATE INDEX idx_award_alerts_active_next_check_at
    ON award_alerts(active, next_check_at)
  `,
  idx_award_alert_runs_alert_id_completed_at: `
    CREATE INDEX idx_award_alert_runs_alert_id_completed_at
    ON award_alert_runs(alert_id, completed_at)
  `,
  idx_notification_events_status_claimed_at_created_at: `
    CREATE INDEX idx_notification_events_status_claimed_at_created_at
    ON notification_events(status, claimed_at, created_at)
  `,
} as const

type SchemaObjectName = keyof typeof CURRENT_SCHEMA_OBJECTS

const collapseWhitespace = (value: string) => {
  let result = ""
  let pendingSpace = false

  for (const character of value) {
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

  return result
}

const normalizeSql = (sql: string | null) => {
  if (!sql)
    return ""

  let normalized = sql.trim().toLowerCase()
  if (normalized.endsWith(";"))
    normalized = normalized.slice(0, -1).trimEnd()

  return collapseWhitespace(normalized)
    .replaceAll("( ", "(")
    .replaceAll(" )", ")")
}

const assertSchemaV1 = (db: Database.Database) => {
  const rows = db.prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name").all() as { name: SchemaObjectName; sql: string | null }[]

  const actual = new Map(rows.map(({ name, sql }) => [name, normalizeSql(sql)]))
  const expectedNames = Object.keys(LEGACY_SCHEMA_OBJECTS) as SchemaObjectName[]

  if (actual.size !== expectedNames.length)
    throw new Error("award alerts SQLite schema does not match v1")

  for (const name of expectedNames) {
    const expected = normalizeSql(LEGACY_SCHEMA_OBJECTS[name])
    const received = actual.get(name)
    if (received !== expected)
      throw new Error(`award alerts SQLite schema mismatch for ${name}`)
  }
}

const assertSchemaV2 = (db: Database.Database) => {
  const rows = db.prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name").all() as { name: SchemaObjectName; sql: string | null }[]

  const actual = new Map(rows.map(({ name, sql }) => [name, normalizeSql(sql)]))
  const expectedNames = Object.keys(CURRENT_SCHEMA_OBJECTS) as SchemaObjectName[]

  if (actual.size !== expectedNames.length)
    throw new Error("award alerts SQLite schema does not match v2")

  for (const name of expectedNames) {
    const expected = normalizeSql(CURRENT_SCHEMA_OBJECTS[name])
    const received = actual.get(name)
    if (received !== expected)
      throw new Error(`award alerts SQLite schema mismatch for ${name}`)
  }
}

const applyMigrationV1 = (db: Database.Database) => {
  db.exec(SCHEMA_V1_SQL)
  assertSchemaV1(db)
}

const migrateV1ToV2 = (db: Database.Database) => {
  db.exec("PRAGMA foreign_keys = OFF")
  try {
    db.exec(`
      ALTER TABLE award_alerts RENAME TO award_alerts_v1;
      ALTER TABLE award_alert_state RENAME TO award_alert_state_v1;
      ALTER TABLE award_alert_runs RENAME TO award_alert_runs_v1;
      ALTER TABLE notification_events RENAME TO notification_events_v1;
      DROP INDEX IF EXISTS idx_award_alerts_active_next_check_at;
      DROP INDEX IF EXISTS idx_award_alert_runs_alert_id_completed_at;
      DROP INDEX IF EXISTS idx_notification_events_status_claimed_at_created_at;
    `)
    db.exec(SCHEMA_V2_SQL)
    db.exec(`
      INSERT INTO award_alerts SELECT * FROM award_alerts_v1;
      INSERT INTO award_alert_state SELECT * FROM award_alert_state_v1;
      INSERT INTO award_alert_runs SELECT * FROM award_alert_runs_v1;
      INSERT INTO notification_events SELECT * FROM notification_events_v1;
      DROP TABLE award_alert_state_v1;
      DROP TABLE award_alert_runs_v1;
      DROP TABLE notification_events_v1;
      DROP TABLE award_alerts_v1;
    `)
  } finally {
    db.exec("PRAGMA foreign_keys = ON")
  }
  assertSchemaV2(db)
}

const runMigrations = (db: Database.Database) => {
  const currentVersion = db.pragma("user_version", { simple: true }) as number

  if (currentVersion > latestSupportedVersion)
    throw new Error(`award alerts SQLite database version ${currentVersion} is newer than the latest supported version ${latestSupportedVersion}`)

  if (currentVersion === 0) {
    db.transaction(() => {
      db.exec(SCHEMA_V2_SQL)
      db.pragma(`user_version = ${latestSupportedVersion}`)
    })()
    return
  }

  if (currentVersion === 1) {
    assertSchemaV1(db)
    db.transaction(() => {
      migrateV1ToV2(db)
      db.pragma(`user_version = ${latestSupportedVersion}`)
    })()
    return
  }

  assertSchemaV2(db)
}

const configurePragmas = (db: Database.Database) => {
  db.pragma("journal_mode = WAL")
  if (db.pragma("journal_mode", { simple: true }) !== "wal")
    throw new Error("award alerts SQLite database failed to enable WAL mode")

  db.pragma("foreign_keys = ON")
  if (db.pragma("foreign_keys", { simple: true }) !== 1)
    throw new Error("award alerts SQLite database failed to enable foreign key enforcement")
}

export const openAwardAlertsDb = (filename: string) => {
  const db = new Database(filename)
  try {
    configurePragmas(db)
    runMigrations(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}
