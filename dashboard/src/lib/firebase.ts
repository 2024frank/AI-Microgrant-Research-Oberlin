import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const configuredFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
};

export const hasFirebaseConfig = Boolean(
  configuredFirebaseConfig.apiKey &&
  configuredFirebaseConfig.authDomain &&
  configuredFirebaseConfig.projectId &&
  configuredFirebaseConfig.appId,
);

const firebaseConfig = hasFirebaseConfig
  ? configuredFirebaseConfig
  : {
      apiKey: "AIzaSyD-local-build-placeholder",
      authDomain: "local-build-placeholder.firebaseapp.com",
      projectId: "local-build-placeholder",
      storageBucket: "local-build-placeholder.appspot.com",
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:localbuildplaceholder",
      measurementId: "",
    };

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
