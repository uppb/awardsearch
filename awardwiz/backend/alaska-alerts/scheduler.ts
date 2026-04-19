import dayjs from "dayjs"
import admin from "firebase-admin"
import { getFirebaseAdminApp } from "./firebase-admin.js"
import type { AlaskaAlert } from "./types.js"

const DEFAULT_DUE_ALERT_LIMIT = 100
const DEFAULT_MIGRATION_FALLBACK_LIMIT = 25
const DEFAULT_MIGRATION_FALLBACK_SCAN_BUDGET = 100

type ListDueAlertsOptions = {
  limit?: number
  migrationFallbackLimit?: number
}

const toAlert = (doc: { id: string, data: () => Record<string, unknown> }) => ({ id: doc.id, ...doc.data() } as AlaskaAlert)

const isLegacyAlertDue = (alert: AlaskaAlert, now: Date) =>
  !alert.lastCheckedAt || dayjs(now).diff(dayjs(alert.lastCheckedAt), "minute") >= alert.pollIntervalMinutes

const dueSortKey = (alert: AlaskaAlert) => {
  if (alert.nextCheckAt)
    return alert.nextCheckAt

  if (!alert.lastCheckedAt)
    return alert.updatedAt

  return dayjs(alert.lastCheckedAt).add(alert.pollIntervalMinutes, "minute").toISOString()
}

const collectLegacyDueAlerts = async (
  db: ReturnType<typeof admin.firestore>,
  now: Date,
  remainingLimit: number,
  migrationFallbackLimit: number,
  scanBudget: number,
): Promise<AlaskaAlert[]> => {
  const legacyDueAlerts: AlaskaAlert[] = []
  let scannedCount = 0
  let cursor: { id: string, data: () => Record<string, unknown> } | undefined

  // Temporary migration path for older active alerts that have not been re-saved with nextCheckAt yet.
  while (legacyDueAlerts.length < remainingLimit && scannedCount < scanBudget) {
    const pageSize = Math.min(migrationFallbackLimit, scanBudget - scannedCount)
    if (pageSize <= 0)
      break

    let query = db
      .collection("alaska_alerts")
      .where("active", "==", true)
      .orderBy("updatedAt")
      .limit(pageSize)

    if (cursor)
      query = query.startAfter(cursor as never)

    const snapshot = await query.get()
    if (snapshot.docs.length === 0)
      break

    for (const doc of snapshot.docs) {
      scannedCount += 1
      const alert = toAlert(doc)
      if (!alert.nextCheckAt && isLegacyAlertDue(alert, now))
        legacyDueAlerts.push(alert)

      if (legacyDueAlerts.length >= remainingLimit || scannedCount >= scanBudget)
        break
    }

    cursor = snapshot.docs[snapshot.docs.length - 1]
    if (snapshot.docs.length < pageSize)
      break
  }

  return legacyDueAlerts
}

export const listDueAlerts = async (
  now: Date,
  { limit = DEFAULT_DUE_ALERT_LIMIT, migrationFallbackLimit = DEFAULT_MIGRATION_FALLBACK_LIMIT }: ListDueAlertsOptions = {},
): Promise<AlaskaAlert[]> => {
  const db = admin.firestore(getFirebaseAdminApp())
  const nowIso = now.toISOString()
  const dueSnapshot = await db
    .collection("alaska_alerts")
    .where("active", "==", true)
    .where("nextCheckAt", "<=", nowIso)
    .orderBy("nextCheckAt")
    .limit(limit)
    .get()

  const dueAlerts = dueSnapshot.docs.map(toAlert)
  if (dueAlerts.length >= limit || migrationFallbackLimit <= 0)
    return dueAlerts

  const legacyDueAlerts = await collectLegacyDueAlerts(
    db,
    now,
    limit - dueAlerts.length,
    migrationFallbackLimit,
    DEFAULT_MIGRATION_FALLBACK_SCAN_BUDGET,
  )

  return [...dueAlerts, ...legacyDueAlerts]
    .sort((left, right) => dueSortKey(left).localeCompare(dueSortKey(right)))
    .slice(0, limit)
}
