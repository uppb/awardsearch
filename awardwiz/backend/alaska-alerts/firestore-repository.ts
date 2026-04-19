import admin from "firebase-admin"
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

  async saveEvaluation({ alert, state, run }: { alert?: AlaskaAlert, state: AlaskaAlertState, run: AlaskaAlertRun }) {
    const alertId = alert?.id ?? state.alertId
    const batch = firestore().batch()
    batch.set(firestore().collection("alaska_alert_state").doc(alertId), state)
    batch.set(firestore().collection("alaska_alert_runs").doc(run.id), run)
    batch.update(firestore().collection("alaska_alerts").doc(alertId), {
      lastCheckedAt: state.updatedAt,
      updatedAt: state.updatedAt,
    })
    await batch.commit()
  }

  async createNotificationEvent(event: NotificationEvent) {
    await firestore().collection("notification_events").doc(event.id).set(event)
  }

  async claimPendingNotificationEvents(limit: number, claimedAt: string, staleBefore: string): Promise<NotificationEvent[]> {
    return firestore().runTransaction(async (transaction) => {
      const collection = firestore().collection("notification_events")

      const pendingQuery = collection
        .where("status", "==", "pending")
        .limit(limit)
      const pendingSnapshot = await transaction.get(pendingQuery)
      const pendingDocs = pendingSnapshot.docs.slice(0, limit)

      const remaining = limit - pendingDocs.length
      let staleDocs: typeof pendingSnapshot.docs = []
      if (remaining > 0) {
        const staleProcessingQuery = collection
          .where("status", "==", "processing")
          .where("claimedAt", "<=", staleBefore)
          .limit(remaining)
        const staleSnapshot = await transaction.get(staleProcessingQuery)
        staleDocs = staleSnapshot.docs.slice(0, remaining)
      }

      const claimedEvents = [...pendingDocs, ...staleDocs].map((doc) => {
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
      })
    })
  }

  async markNotificationDeliveredUnconfirmed(id: string, reason: string) {
    await firestore().collection("notification_events").doc(id).update({
      status: "delivered_unconfirmed",
      sentAt: admin.firestore.FieldValue.delete(),
      claimedAt: admin.firestore.FieldValue.delete(),
      claimToken: admin.firestore.FieldValue.delete(),
      failureReason: reason,
    })
  }

  async markNotificationSent(id: string, sentAt: string) {
    await firestore().collection("notification_events").doc(id).update({
      status: "sent",
      sentAt,
      claimedAt: admin.firestore.FieldValue.delete(),
      claimToken: admin.firestore.FieldValue.delete(),
      failureReason: admin.firestore.FieldValue.delete(),
    })
  }

  async markNotificationFailed(id: string, reason: string) {
    await firestore().collection("notification_events").doc(id).update({
      status: "failed",
      claimedAt: admin.firestore.FieldValue.delete(),
      claimToken: admin.firestore.FieldValue.delete(),
      failureReason: reason,
    })
  }
}
