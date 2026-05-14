import "server-only";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function initAdmin() {
  if (getApps().length > 0) return;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
  } else {
    initializeApp();
  }
}

initAdmin();

/**
 * Verifies a Firebase ID token from `Authorization: Bearer <token>`.
 * Uses `checkRevoked` so disabled/revoked sessions stop working (disable with FIREBASE_CHECK_REVOKED=false).
 */
export async function verifyBearerIdToken(authHeader: string | null) {
  const raw = authHeader?.trim();
  if (!raw?.toLowerCase().startsWith("bearer ")) return null;
  const token = raw.slice(7).trim();
  if (!token) return null;
  const checkRevoked = process.env.FIREBASE_CHECK_REVOKED !== "false";
  try {
    return await getAuth().verifyIdToken(token, checkRevoked);
  } catch {
    return null;
  }
}
