import dayjs from "dayjs"
import admin from "firebase-admin"
import { getFirebaseAdminApp } from "./firebase-admin.js"
import type { AlaskaAlert } from "./types.js"

const DEFAULT_DUE_ALERT_LIMIT = 100
const DEFAULT_MIGRATION_FALLBACK_LIMIT = 25

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

  // Temporary migration path for older active alerts that have not been re-saved with nextCheckAt yet.
  const legacySnapshot = await db
    .collection("alaska_alerts")
    .where("active", "==", true)
    .orderBy("updatedAt")
    .limit(migrationFallbackLimit)
    .get()

  const legacyDueAlerts = legacySnapshot.docs
    .map(toAlert)
    .filter((alert) => !alert.nextCheckAt && isLegacyAlertDue(alert, now))

  return [...dueAlerts, ...legacyDueAlerts]
    .sort((left, right) => dueSortKey(left).localeCompare(dueSortKey(right)))
    .slice(0, limit)
}
