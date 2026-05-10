import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";

export async function signInWithGoogle(loginHint?: string) {
  const provider = new GoogleAuthProvider();
  if (loginHint) {
    provider.setCustomParameters({ login_hint: loginHint, prompt: "none" });
    try {
      return await signInWithPopup(firebaseAuth, provider);
    } catch {
      // prompt:"none" fails for first-time users — retry with picker pre-selected
      provider.setCustomParameters({ login_hint: loginHint });
      return signInWithPopup(firebaseAuth, provider);
    }
  }
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(firebaseAuth, provider);
}

export function signOutUser() {
  return signOut(firebaseAuth);
}
