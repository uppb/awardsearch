import dayjs from "dayjs"
import admin from "firebase-admin"
import { getFirebaseAdminApp } from "./firebase-admin.js"
import type { AlaskaAlert } from "./types.js"

const DEFAULT_DUE_ALERT_LIMIT = 100
const DEFAULT_CLAIM_TTL_MINUTES = 5
const DEFAULT_MIGRATION_FALLBACK_LIMIT = 25
const DEFAULT_MIGRATION_FALLBACK_SCAN_BUDGET = 100

type ClaimDueAlertsOptions = {
  limit?: number
  claimTtlMinutes?: number
  migrationFallbackLimit?: number
}

type AlertDoc = {
  id: string
  data: () => Record<string, unknown>
  ref: FirebaseFirestore.DocumentReference
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
  transaction: FirebaseFirestore.Transaction,
  db: ReturnType<typeof admin.firestore>,
  now: Date,
  remainingLimit: number,
  migrationFallbackLimit: number,
  scanBudget: number,
): Promise<AlertDoc[]> => {
  const legacyDueAlerts: AlertDoc[] = []
  let scannedCount = 0
  let cursor: AlertDoc | undefined

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

    const snapshot = await transaction.get(query)
    if (snapshot.docs.length === 0)
      break

    for (const doc of snapshot.docs) {
      scannedCount += 1
      const alert = toAlert(doc)
      if (!alert.nextCheckAt && isLegacyAlertDue(alert, now))
        legacyDueAlerts.push(doc as AlertDoc)

      if (legacyDueAlerts.length >= remainingLimit || scannedCount >= scanBudget)
        break
    }

    cursor = snapshot.docs[snapshot.docs.length - 1]
    if (snapshot.docs.length < pageSize)
      break
  }

  return legacyDueAlerts
}

export const claimDueAlerts = async (
  now: Date,
  {
    limit = DEFAULT_DUE_ALERT_LIMIT,
    claimTtlMinutes = DEFAULT_CLAIM_TTL_MINUTES,
    migrationFallbackLimit = DEFAULT_MIGRATION_FALLBACK_LIMIT,
  }: ClaimDueAlertsOptions = {},
): Promise<AlaskaAlert[]> => {
  const db = admin.firestore(getFirebaseAdminApp())
  const nowIso = now.toISOString()
  const claimedUntilIso = dayjs(now).add(claimTtlMinutes, "minute").toISOString()

  return db.runTransaction(async (transaction) => {
    const dueSnapshot = await transaction.get(db
      .collection("alaska_alerts")
      .where("active", "==", true)
      .where("nextCheckAt", "<=", nowIso)
      .orderBy("nextCheckAt")
      .limit(limit))

    const dueDocs = dueSnapshot.docs as AlertDoc[]
    let claimedDocs = dueDocs

    if (claimedDocs.length < limit && migrationFallbackLimit > 0) {
      const legacyDueDocs = await collectLegacyDueAlerts(
        transaction,
        db,
        now,
        limit - claimedDocs.length,
        migrationFallbackLimit,
        DEFAULT_MIGRATION_FALLBACK_SCAN_BUDGET,
      )

      claimedDocs = [...claimedDocs, ...legacyDueDocs]
        .sort((left, right) => dueSortKey(toAlert(left)).localeCompare(dueSortKey(toAlert(right))))
        .slice(0, limit)
    }

    for (const doc of claimedDocs)
      transaction.update(doc.ref, { nextCheckAt: claimedUntilIso })

    return claimedDocs.map((doc) => ({
      ...toAlert(doc),
      nextCheckAt: claimedUntilIso,
    }))
  })
}
