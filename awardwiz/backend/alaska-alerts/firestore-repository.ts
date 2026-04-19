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

  async claimPendingNotificationEvents(limit: number, claimedAt: string): Promise<NotificationEvent[]> {
    return firestore().runTransaction(async (transaction) => {
      const query = firestore().collection("notification_events")
        .where("status", "==", "pending")
        .limit(limit)

      const snapshot = await transaction.get(query)
      for (const doc of snapshot.docs) {
        transaction.update(doc.ref, {
          status: "processing",
          claimedAt,
        })
      }

      return snapshot.docs.map((doc) => ({
        ...(doc.data() as NotificationEvent),
        status: "processing",
        claimedAt,
      }))
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

  async markNotificationPending(id: string, reason: string) {
    await firestore().collection("notification_events").doc(id).update({
      status: "pending",
      sentAt: admin.firestore.FieldValue.delete(),
      claimedAt: admin.firestore.FieldValue.delete(),
      failureReason: reason,
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
