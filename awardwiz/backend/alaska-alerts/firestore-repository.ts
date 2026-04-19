import admin from "firebase-admin"
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

      const claimedEvents: NotificationEvent[] = []

      const pendingQuery = collection
        .where("status", "==", "pending")
        .limit(limit)

      const pendingSnapshot = await transaction.get(pendingQuery)
      for (const doc of pendingSnapshot.docs) {
        transaction.update(doc.ref, {
          status: "processing",
          claimedAt,
        })
        claimedEvents.push({
          ...(doc.data() as NotificationEvent),
          status: "processing",
          claimedAt,
        })
      }

      const remaining = limit - claimedEvents.length
      if (remaining > 0) {
        const staleProcessingQuery = collection
          .where("status", "==", "processing")
          .where("claimedAt", "<=", staleBefore)
          .limit(remaining)

        const staleSnapshot = await transaction.get(staleProcessingQuery)
        for (const doc of staleSnapshot.docs) {
          transaction.update(doc.ref, {
            status: "processing",
            claimedAt,
          })
          claimedEvents.push({
            ...(doc.data() as NotificationEvent),
            status: "processing",
            claimedAt,
          })
        }
      }

      return claimedEvents
    })
  }

  async markNotificationAttempting(id: string, attemptedAt: string) {
    await firestore().collection("notification_events").doc(id).update({
      status: "attempting",
      sentAt: admin.firestore.FieldValue.delete(),
      failureReason: admin.firestore.FieldValue.delete(),
    })
  }

  async markNotificationDeliveredUnconfirmed(id: string, reason: string) {
    await firestore().collection("notification_events").doc(id).update({
      status: "delivered_unconfirmed",
      sentAt: admin.firestore.FieldValue.delete(),
      claimedAt: admin.firestore.FieldValue.delete(),
      failureReason: reason,
    })
  }

  async markNotificationSent(id: string, sentAt: string) {
    await firestore().collection("notification_events").doc(id).update({
      status: "sent",
      sentAt,
      claimedAt: admin.firestore.FieldValue.delete(),
      failureReason: admin.firestore.FieldValue.delete(),
    })
  }

  async markNotificationFailed(id: string, reason: string) {
    await firestore().collection("notification_events").doc(id).update({
      status: "failed",
      claimedAt: admin.firestore.FieldValue.delete(),
      failureReason: reason,
    })
  }
}
