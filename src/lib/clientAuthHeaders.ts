"use client";

import { firebaseAuth } from "@/lib/firebase";

/** Throws if there is no Firebase session (caller should only run after auth is ready). */
export async function getClientBearerAuthHeader(): Promise<{ Authorization: string }> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

export async function getClientJsonAuthHeaders(): Promise<{
  Authorization: string;
  "Content-Type": string;
}> {
  return { ...(await getClientBearerAuthHeader()), "Content-Type": "application/json" };
}
