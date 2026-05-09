import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: "select_account",
  });

  return signInWithPopup(firebaseAuth, provider);
}

export function signOutUser() {
  return signOut(firebaseAuth);
}
