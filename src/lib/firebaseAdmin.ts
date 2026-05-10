import "server-only";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function initAdmin() {
  if (getApps().length > 0) return;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  } else {
    // Fallback: use GOOGLE_APPLICATION_CREDENTIALS or default credentials
    initializeApp();
  }
}

initAdmin();

export const adminDb = getFirestore();
adminDb.settings({ ignoreUndefinedProperties: true });
export const serverTimestamp = () => FieldValue.serverTimestamp();
