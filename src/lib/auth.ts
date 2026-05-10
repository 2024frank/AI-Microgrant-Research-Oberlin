import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";

export async function signInWithGoogle(loginHint?: string) {
  const provider = new GoogleAuthProvider();
  if (loginHint) {
    provider.setCustomParameters({ login_hint: loginHint });
  } else {
    provider.setCustomParameters({ prompt: "select_account" });
  }

  return signInWithPopup(firebaseAuth, provider);
}

export function signOutUser() {
  return signOut(firebaseAuth);
}
