import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

let _app: App | null = null;

function getApp(): App {
  if (_app) return _app;
  if (getApps().length > 0) {
    _app = getApps()[0];
    return _app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set");
  _app = initializeApp({ credential: cert(JSON.parse(raw)) });
  return _app;
}

export function getAdminDb(): Firestore {
  return getFirestore(getApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getApp());
}
