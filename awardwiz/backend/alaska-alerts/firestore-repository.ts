import admin from "firebase-admin"
import dayjs from "dayjs"
import { randomUUID } from "node:crypto"
import { getFirebaseAdminApp } from "./firebase-admin.js"
import type { AlaskaAlert, AlaskaAlertRun, AlaskaAlertState, NotificationEvent } from "./types.js"
import type { AlertRepository } from "./evaluator.js"

const firestore = () => admin.firestore(getFirebaseAdminApp())

export class FirestoreAlaskaAlertsRepository implements AlertRepository {
  async getState(alertId: string): Promise<AlaskaAlertState | undefined> {
    const doc = await firestore().collection("alaska_alert_state").doc(alertId).get()
    return doc.exists ? doc.data() as AlaskaAlertState : undefined
  }

  async saveEvaluation({ alert, state, run }: { alert: AlaskaAlert, state: AlaskaAlertState, run: AlaskaAlertRun }) {
    const alertId = alert.id
    const batch = firestore().batch()
    batch.set(firestore().collection("alaska_alert_state").doc(alertId), state)
    batch.set(firestore().collection("alaska_alert_runs").doc(run.id), run)
    batch.update(firestore().collection("alaska_alerts").doc(alertId), {
      lastCheckedAt: state.updatedAt,
      nextCheckAt: dayjs(state.updatedAt).add(alert.pollIntervalMinutes, "minute").toISOString(),
      updatedAt: state.updatedAt,
    })
    await batch.commit()
  }

  async createNotificationEvent(event: NotificationEvent) {
    const docRef = firestore().collection("notification_events").doc(event.id)
    await firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef)
      if (snapshot.exists)
        return

      transaction.set(docRef, event)
    })
  }

  async claimPendingNotificationEvents(limit: number, claimedAt: string, staleBefore: string): Promise<NotificationEvent[]> {
    return firestore().runTransaction(async (transaction) => {
      const collection = firestore().collection("notification_events")
      const staleAttemptingQuery = collection
        .where("status", "==", "attempting")
        .where("claimedAt", "<=", staleBefore)
        .limit(limit)
      const staleAttemptingSnapshot = await transaction.get(staleAttemptingQuery)
      for (const doc of staleAttemptingSnapshot.docs) {
        transaction.update(doc.ref, {
          status: "delivered_unconfirmed",
          sentAt: admin.firestore.FieldValue.delete(),
          claimedAt: admin.firestore.FieldValue.delete(),
          claimToken: admin.firestore.FieldValue.delete(),
          attemptedAt: admin.firestore.FieldValue.delete(),
          failureReason: `At-most-once: stale attempting event was finalized without retry after worker interruption (claimed before ${staleBefore}).`,
        })
      }

      const staleProcessingQuery = collection
        .where("status", "==", "processing")
        .where("claimedAt", "<=", staleBefore)
        .limit(limit)
      const staleSnapshot = await transaction.get(staleProcessingQuery)
      const staleDocs = staleSnapshot.docs.slice(0, limit)

      const pendingQuery = collection
        .where("status", "==", "pending")
        .limit(Math.max(0, limit - staleDocs.length))
      const pendingSnapshot = await transaction.get(pendingQuery)
      const pendingDocs = pendingSnapshot.docs.slice(0, Math.max(0, limit - staleDocs.length))

      const claimedEvents = [...staleDocs, ...pendingDocs].map((doc) => {
        const claimToken = randomUUID()
        transaction.update(doc.ref, {
          status: "processing",
          claimedAt,
          claimToken,
        })
        return {
          ...(doc.data() as NotificationEvent),
          status: "processing",
          claimedAt,
          claimToken,
        } satisfies NotificationEvent
      })

      return claimedEvents
    })
  }

  async markNotificationAttempting(id: string, attemptedAt: string, claimToken: string | undefined) {
    const docRef = firestore().collection("notification_events").doc(id)
    await firestore().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(docRef)
      if (!snapshot.exists)
        throw new Error("notification event not found")

      const current = snapshot.data() as NotificationEvent
      if (current.status !== "processing" || current.claimToken !== claimToken)
        throw new Error("stale claim token")

      transaction.update(docRef, {
        status: "attempting",
        attemptedAt,
      })
    })
  }

  async markNotificationDeliveredUnconfirmed(id: string, reason: string) {
    await firestore().collection("notification_events").doc(id).update({
      status: "delivered_unconfirmed",
      sentAt: admin.firestore.FieldValue.delete(),
      claimedAt: admin.firestore.FieldValue.delete(),
      claimToken: admin.firestore.FieldValue.delete(),
      attemptedAt: admin.firestore.FieldValue.delete(),
      failureReason: reason,
    })
  }

  async markNotificationSent(id: string, sentAt: string) {
    await firestore().collection("notification_events").doc(id).update({
      status: "sent",
      sentAt,
      claimedAt: admin.firestore.FieldValue.delete(),
      claimToken: admin.firestore.FieldValue.delete(),
      attemptedAt: admin.firestore.FieldValue.delete(),
      failureReason: admin.firestore.FieldValue.delete(),
    })
  }

  async markNotificationFailed(id: string, reason: string) {
    await firestore().collection("notification_events").doc(id).update({
      status: "failed",
      claimedAt: admin.firestore.FieldValue.delete(),
      claimToken: admin.firestore.FieldValue.delete(),
      attemptedAt: admin.firestore.FieldValue.delete(),
      failureReason: reason,
    })
  }
}
