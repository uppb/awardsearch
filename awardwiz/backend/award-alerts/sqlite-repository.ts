import Database from "better-sqlite3"
import dayjs from "dayjs"
import { randomUUID } from "node:crypto"
import type { AwardAlert, AwardAlertCabin } from "./types.js"

type AwardAlertMatch = {
  date: string
  flightNo: string
  origin: string
  destination: string
  departureDateTime: string
  arrivalDateTime: string
  cabin: AwardAlertCabin
  miles: number
  cash: number
  currencyOfCash: string
  bookingClass: string | undefined
  segmentCount: number
}

type AwardAlertState = {
  alertId: string
  hasMatch: boolean
  matchedDates: string[]
  matchingResults: AwardAlertMatch[]
  bestMatchSummary: AwardAlertMatch | undefined
  matchFingerprint: string
  lastMatchAt: string | undefined
  lastNotifiedAt: string | undefined
  lastErrorAt: string | undefined
  lastErrorMessage: string | undefined
  updatedAt: string
}

type AwardAlertRun = {
  id: string
  alertId: string
  startedAt: string
  completedAt: string
  searchedDates: string[]
  scrapeCount: number
  scrapeSuccessCount: number
  scrapeErrorCount: number
  matchedResultCount: number
  hasMatch: boolean
  errorSummary: string | undefined
}

type NotificationEventStatus = "pending" | "processing" | "attempting" | "delivered_unconfirmed" | "sent" | "failed"

type NotificationPayload = {
  origin: string
  destination: string
  cabin: AwardAlertCabin
  matchedDates: string[]
  matchCount: number
  nonstopOnly: boolean
  maxMiles: number | undefined
  maxCash: number | undefined
  bestMatch: AwardAlertMatch | undefined
  bookingUrl: string
}

type NotificationEvent = {
  id: string
  alertId: string
  userId: string
  createdAt: string
  status: NotificationEventStatus
  claimedAt?: string
  claimToken?: string
  attemptedAt?: string
  payload: NotificationPayload
  sentAt: string | undefined
  failureReason: string | undefined
}

type AwardAlertRow = {
  id: string
  program: string
  user_id: string
  origin: string
  destination: string
  date_mode: AwardAlert["dateMode"]
  date: string | null
  start_date: string | null
  end_date: string | null
  cabin: AwardAlertCabin
  nonstop_only: number
  max_miles: number | null
  max_cash: number | null
  active: number
  poll_interval_minutes: number
  min_notification_interval_minutes: number
  last_checked_at: string | null
  next_check_at: string | null
  created_at: string
  updated_at: string
}

type AwardAlertStateRow = {
  alert_id: string
  has_match: number
  matched_dates: string | null
  matching_results: string | null
  best_match_summary: string | null
  match_fingerprint: string | null
  last_match_at: string | null
  last_notified_at: string | null
  last_error_at: string | null
  last_error_message: string | null
  updated_at: string
}

type NotificationEventRow = {
  id: string
  alert_id: string
  user_id: string
  created_at: string
  status: NotificationEventStatus
  claimed_at: string | null
  claim_token: string | null
  attempted_at: string | null
  payload: string
  sent_at: string | null
  failure_reason: string | null
}

const toDbBoolean = (value: boolean) => value ? 1 : 0
const fromDbBoolean = (value: number) => value === 1

const parseJson = <T>(value: string): T => JSON.parse(value) as T

const mapAlertRow = (row: AwardAlertRow): AwardAlert => {
  const base = {
    id: row.id,
    program: row.program,
    userId: row.user_id,
    origin: row.origin,
    destination: row.destination,
    cabin: row.cabin,
    nonstopOnly: fromDbBoolean(row.nonstop_only),
    maxMiles: row.max_miles ?? undefined,
    maxCash: row.max_cash ?? undefined,
    active: fromDbBoolean(row.active),
    pollIntervalMinutes: row.poll_interval_minutes,
    minNotificationIntervalMinutes: row.min_notification_interval_minutes,
    lastCheckedAt: row.last_checked_at ?? undefined,
    nextCheckAt: row.next_check_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  if (row.date_mode === "single_date") {
    return {
      ...base,
      dateMode: "single_date",
      date: row.date ?? "",
    }
  }

  return {
    ...base,
    dateMode: "date_range",
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
  }
}

const mapStateRow = (row: AwardAlertStateRow): AwardAlertState => ({
  alertId: row.alert_id,
  hasMatch: fromDbBoolean(row.has_match),
  matchedDates: row.matched_dates === null ? [] : parseJson<string[]>(row.matched_dates),
  matchingResults: row.matching_results === null ? [] : parseJson<AwardAlertMatch[]>(row.matching_results),
  bestMatchSummary: row.best_match_summary === null ? undefined : parseJson<AwardAlertMatch>(row.best_match_summary),
  matchFingerprint: row.match_fingerprint ?? "",
  lastMatchAt: row.last_match_at ?? undefined,
  lastNotifiedAt: row.last_notified_at ?? undefined,
  lastErrorAt: row.last_error_at ?? undefined,
  lastErrorMessage: row.last_error_message ?? undefined,
  updatedAt: row.updated_at,
})

const mapNotificationEventRow = (row: NotificationEventRow): NotificationEvent => ({
  id: row.id,
  alertId: row.alert_id,
  userId: row.user_id,
  createdAt: row.created_at,
  status: row.status === "processing" && row.attempted_at !== null ? "attempting" : row.status,
  claimedAt: row.claimed_at ?? undefined,
  claimToken: row.claim_token ?? undefined,
  attemptedAt: row.attempted_at ?? undefined,
  payload: parseJson<NotificationPayload>(row.payload),
  sentAt: row.sent_at ?? undefined,
  failureReason: row.failure_reason ?? undefined,
})

const assertRowUpdated = (changes: number, entity: string) => {
  if (changes === 0)
    throw new Error(`${entity} not found`)
}

export class SqliteAwardAlertsRepository {
  constructor(private readonly db: Database.Database) {}

  insertAlert(alert: AwardAlert) {
    this.db.prepare(`
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
      id: alert.id,
      program: alert.program,
      user_id: alert.userId,
      origin: alert.origin,
      destination: alert.destination,
      date_mode: alert.dateMode,
      date: alert.dateMode === "single_date" ? alert.date : null,
      start_date: alert.dateMode === "date_range" ? alert.startDate : null,
      end_date: alert.dateMode === "date_range" ? alert.endDate : null,
      cabin: alert.cabin,
      nonstop_only: toDbBoolean(alert.nonstopOnly),
      max_miles: alert.maxMiles ?? null,
      max_cash: alert.maxCash ?? null,
      active: toDbBoolean(alert.active),
      poll_interval_minutes: alert.pollIntervalMinutes,
      min_notification_interval_minutes: alert.minNotificationIntervalMinutes,
      last_checked_at: alert.lastCheckedAt ?? null,
      next_check_at: alert.nextCheckAt ?? null,
      created_at: alert.createdAt,
      updated_at: alert.updatedAt,
    })
  }

  getState(alertId: string): AwardAlertState | undefined {
    const row = this.db.prepare("SELECT * FROM award_alert_state WHERE alert_id = ?").get(alertId) as AwardAlertStateRow | undefined
    return row === undefined ? undefined : mapStateRow(row)
  }

  saveEvaluation({ alert, state, run }: { alert: AwardAlert, state: AwardAlertState, run: AwardAlertRun }) {
    const nextCheckAt = dayjs(state.updatedAt).add(alert.pollIntervalMinutes, "minute").toISOString()

    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO award_alert_state (
          alert_id, has_match, matched_dates, matching_results, best_match_summary, match_fingerprint,
          last_match_at, last_notified_at, last_error_at, last_error_message, updated_at
        ) VALUES (
          @alert_id, @has_match, @matched_dates, @matching_results, @best_match_summary, @match_fingerprint,
          @last_match_at, @last_notified_at, @last_error_at, @last_error_message, @updated_at
        )
        ON CONFLICT(alert_id) DO UPDATE SET
          has_match = excluded.has_match,
          matched_dates = excluded.matched_dates,
          matching_results = excluded.matching_results,
          best_match_summary = excluded.best_match_summary,
          match_fingerprint = excluded.match_fingerprint,
          last_match_at = excluded.last_match_at,
          last_notified_at = excluded.last_notified_at,
          last_error_at = excluded.last_error_at,
          last_error_message = excluded.last_error_message,
          updated_at = excluded.updated_at
      `).run({
        alert_id: state.alertId,
        has_match: toDbBoolean(state.hasMatch),
        matched_dates: JSON.stringify(state.matchedDates),
        matching_results: JSON.stringify(state.matchingResults),
        best_match_summary: state.bestMatchSummary === undefined ? null : JSON.stringify(state.bestMatchSummary),
        match_fingerprint: state.matchFingerprint,
        last_match_at: state.lastMatchAt ?? null,
        last_notified_at: state.lastNotifiedAt ?? null,
        last_error_at: state.lastErrorAt ?? null,
        last_error_message: state.lastErrorMessage ?? null,
        updated_at: state.updatedAt,
      })

      this.db.prepare(`
        INSERT INTO award_alert_runs (
          id, alert_id, started_at, completed_at, searched_dates, scrape_count, scrape_success_count,
          scrape_error_count, matched_result_count, has_match, error_summary
        ) VALUES (
          @id, @alert_id, @started_at, @completed_at, @searched_dates, @scrape_count, @scrape_success_count,
          @scrape_error_count, @matched_result_count, @has_match, @error_summary
        )
        ON CONFLICT(id) DO UPDATE SET
          alert_id = excluded.alert_id,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          searched_dates = excluded.searched_dates,
          scrape_count = excluded.scrape_count,
          scrape_success_count = excluded.scrape_success_count,
          scrape_error_count = excluded.scrape_error_count,
          matched_result_count = excluded.matched_result_count,
          has_match = excluded.has_match,
          error_summary = excluded.error_summary
      `).run({
        id: run.id,
        alert_id: run.alertId,
        started_at: run.startedAt,
        completed_at: run.completedAt,
        searched_dates: JSON.stringify(run.searchedDates),
        scrape_count: run.scrapeCount,
        scrape_success_count: run.scrapeSuccessCount,
        scrape_error_count: run.scrapeErrorCount,
        matched_result_count: run.matchedResultCount,
        has_match: toDbBoolean(run.hasMatch),
        error_summary: run.errorSummary ?? null,
      })

      const result = this.db.prepare(`
        UPDATE award_alerts
        SET last_checked_at = ?, next_check_at = ?, updated_at = ?
        WHERE id = ?
      `).run(state.updatedAt, nextCheckAt, state.updatedAt, alert.id)

      assertRowUpdated(result.changes, "award alert")
    })()
  }

  createNotificationEvent(event: NotificationEvent) {
    const storedStatus = event.status === "attempting" ? "processing" : event.status

    this.db.prepare(`
      INSERT OR IGNORE INTO notification_events (
        id, alert_id, user_id, created_at, status, claimed_at, claim_token, attempted_at, payload, sent_at, failure_reason
      ) VALUES (
        @id, @alert_id, @user_id, @created_at, @status, @claimed_at, @claim_token, @attempted_at, @payload, @sent_at, @failure_reason
      )
    `).run({
      id: event.id,
      alert_id: event.alertId,
      user_id: event.userId,
      created_at: event.createdAt,
      status: storedStatus,
      claimed_at: event.claimedAt ?? null,
      claim_token: event.claimToken ?? null,
      attempted_at: event.attemptedAt ?? null,
      payload: JSON.stringify(event.payload),
      sent_at: event.sentAt ?? null,
      failure_reason: event.failureReason ?? null,
    })
  }

  claimDueAlerts(nowIso: string, limit: number, claimTtlMinutes: number): AwardAlert[] {
    const claimedUntil = dayjs(nowIso).add(claimTtlMinutes, "minute").toISOString()

    return this.db.transaction(() => {
      const rows = this.db.prepare(`
        SELECT *
        FROM award_alerts
        WHERE active = 1 AND next_check_at <= ?
        ORDER BY next_check_at, id
        LIMIT ?
      `).all(nowIso, limit) as AwardAlertRow[]

      const update = this.db.prepare(`
        UPDATE award_alerts
        SET next_check_at = ?, updated_at = ?
        WHERE id = ?
      `)

      for (const row of rows)
        update.run(claimedUntil, nowIso, row.id)

      return rows.map((row) => mapAlertRow({
        ...row,
        next_check_at: claimedUntil,
        updated_at: nowIso,
      }))
    })()
  }

  claimPendingNotificationEvents(limit: number, claimedAt: string, staleBefore: string): NotificationEvent[] {
    return this.db.transaction(() => {
      const staleAttemptingRows = this.db.prepare(`
        SELECT *
        FROM notification_events
        WHERE status = 'processing' AND attempted_at IS NOT NULL AND claimed_at <= ?
        ORDER BY claimed_at, created_at, id
        LIMIT ?
      `).all(staleBefore, limit) as NotificationEventRow[]

      const finalizeAttempting = this.db.prepare(`
        UPDATE notification_events
        SET status = 'delivered_unconfirmed',
            sent_at = NULL,
            claimed_at = NULL,
            claim_token = NULL,
            attempted_at = NULL,
            failure_reason = ?
        WHERE id = ?
      `)

      for (const row of staleAttemptingRows) {
        finalizeAttempting.run(
          `At-most-once: stale attempting event was finalized without retry after worker interruption (claimed before ${staleBefore}).`,
          row.id,
        )
      }

      const staleProcessingRows = this.db.prepare(`
        SELECT *
        FROM notification_events
        WHERE status = 'processing' AND attempted_at IS NULL AND claimed_at <= ?
        ORDER BY claimed_at, created_at, id
        LIMIT ?
      `).all(staleBefore, limit) as NotificationEventRow[]

      const pendingRows = this.db.prepare(`
        SELECT *
        FROM notification_events
        WHERE status = 'pending'
        ORDER BY created_at, id
        LIMIT ?
      `).all(Math.max(0, limit - staleProcessingRows.length)) as NotificationEventRow[]

      const claimRows = [...staleProcessingRows, ...pendingRows]
      const claim = this.db.prepare(`
        UPDATE notification_events
        SET status = 'processing', claimed_at = ?, claim_token = ?
        WHERE id = ?
      `)

      return claimRows.map((row) => {
        const claimToken = randomUUID()
        claim.run(claimedAt, claimToken, row.id)

        return mapNotificationEventRow({
          ...row,
          status: "processing",
          claimed_at: claimedAt,
          claim_token: claimToken,
        })
      })
    })()
  }

  markNotificationAttempting(id: string, attemptedAt: string, claimToken: string | undefined) {
    this.db.transaction(() => {
      const current = this.db.prepare("SELECT status, claim_token, attempted_at FROM notification_events WHERE id = ?").get(id) as {
        status: NotificationEventStatus
        claim_token: string | null
        attempted_at: string | null
      } | undefined
      if (current === undefined)
        throw new Error("notification event not found")

      if (
        current.status !== "processing"
        || current.claim_token !== (claimToken ?? null)
        || current.attempted_at !== null
      ) {
        throw new Error("stale claim token")
      }

      assertRowUpdated(
        this.db.prepare("UPDATE notification_events SET attempted_at = ? WHERE id = ?").run(attemptedAt, id).changes,
        "notification event",
      )
    })()
  }

  markNotificationDeliveredUnconfirmed(id: string, reason: string) {
    assertRowUpdated(
      this.db.prepare(`
        UPDATE notification_events
        SET status = 'delivered_unconfirmed',
            sent_at = NULL,
            claimed_at = NULL,
            claim_token = NULL,
            attempted_at = NULL,
            failure_reason = ?
        WHERE id = ?
      `).run(reason, id).changes,
      "notification event",
    )
  }

  markNotificationSent(id: string, sentAt: string) {
    assertRowUpdated(
      this.db.prepare(`
        UPDATE notification_events
        SET status = 'sent',
            sent_at = ?,
            claimed_at = NULL,
            claim_token = NULL,
            attempted_at = NULL,
            failure_reason = NULL
        WHERE id = ?
      `).run(sentAt, id).changes,
      "notification event",
    )
  }

  markNotificationFailed(id: string, reason: string) {
    assertRowUpdated(
      this.db.prepare(`
        UPDATE notification_events
        SET status = 'failed',
            claimed_at = NULL,
            claim_token = NULL,
            attempted_at = NULL,
            failure_reason = ?
        WHERE id = ?
      `).run(reason, id).changes,
      "notification event",
    )
  }
}
