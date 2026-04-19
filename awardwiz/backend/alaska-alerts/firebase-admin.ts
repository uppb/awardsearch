import admin from "firebase-admin"

let app: admin.app.App | undefined

export const getFirebaseAdminApp = () => {
  if (app)
    return app

  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
    process.env["FIRESTORE_EMULATOR_HOST"] = "localhost:8080"
    process.env["FIREBASE_AUTH_EMULATOR_HOST"] = "127.0.0.1:9099"
    app = admin.initializeApp({ projectId: "awardwiz" })
    return app
  }

  const serviceAccountJson = import.meta.env.VITE_FIREBASE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJson)
    throw new Error("Missing VITE_FIREBASE_SERVICE_ACCOUNT_JSON environment variable")

  app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson) as admin.ServiceAccount) })
  return app
}
