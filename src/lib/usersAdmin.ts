import "server-only";
import { adminDb } from "./firebaseAdmin";
import type { AuthorizedUser } from "./users";

function serializeUser(data: FirebaseFirestore.DocumentData, id: string): AuthorizedUser {
  return {
    uid: data.uid ?? id,
    email: data.email ?? "",
    displayName: data.displayName ?? null,
    photoURL: data.photoURL ?? null,
    role: data.role ?? "viewer",
    status: data.status ?? "pending",
    lastLoginAt: data.lastLoginAt ?? null,
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    invitedBy: data.invitedBy ?? null,
  };
}

export async function listAuthorizedUsersAdmin(): Promise<AuthorizedUser[]> {
  const snap = await adminDb.collection("users").orderBy("email", "asc").get();
  return snap.docs.map((d) => serializeUser(d.data(), d.id));
}
