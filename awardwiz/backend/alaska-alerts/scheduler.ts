import dayjs from "dayjs"
import admin from "firebase-admin"
import { getFirebaseAdminApp } from "./firebase-admin.js"
import type { AlaskaAlert } from "./types.js"

export const listDueAlerts = async (now: Date): Promise<AlaskaAlert[]> => {
  const snapshot = await admin.firestore(getFirebaseAdminApp())
    .collection("alaska_alerts")
    .where("active", "==", true)
    .get()

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() } as AlaskaAlert))
    .filter((alert) => !alert.lastCheckedAt || dayjs(now).diff(dayjs(alert.lastCheckedAt), "minute") >= alert.pollIntervalMinutes)
}
