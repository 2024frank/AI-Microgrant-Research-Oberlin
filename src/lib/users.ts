import type { User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";

import { firebaseDb } from "@/lib/firebase";

export type UserRole = "super_admin" | "admin" | "reviewer" | "viewer";
export type UserStatus = "active" | "pending" | "disabled";

export type AuthorizedUser = {
  uid: string | null;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  invitedBy: string | null;
  lastLoginAt: Timestamp | null;
};

export const allowedRoles: UserRole[] = ["super_admin", "admin", "reviewer", "viewer"];
export const allowedStatuses: UserStatus[] = ["active", "pending", "disabled"];

// fkusiapp@oberlin.edu is the bootstrap super admin for local/project setup.
export const bootstrapSuperAdminEmail = "fkusiapp@oberlin.edu";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function userDocRef(email: string) {
  return doc(firebaseDb, "users", normalizeEmail(email));
}

export function canAccessAdminControl(role: UserRole | null): boolean {
  return role === "super_admin" || role === "admin";
}

function serializeUser(snapshotData: Record<string, unknown>, fallbackEmail: string): AuthorizedUser {
  return {
    uid: typeof snapshotData.uid === "string" ? snapshotData.uid : null,
    email: typeof snapshotData.email === "string" ? snapshotData.email : fallbackEmail,
    displayName: typeof snapshotData.displayName === "string" ? snapshotData.displayName : null,
    photoURL: typeof snapshotData.photoURL === "string" ? snapshotData.photoURL : null,
    role: allowedRoles.includes(snapshotData.role as UserRole)
      ? (snapshotData.role as UserRole)
      : "viewer",
    status: allowedStatuses.includes(snapshotData.status as UserStatus)
      ? (snapshotData.status as UserStatus)
      : "pending",
    createdAt: (snapshotData.createdAt as Timestamp | undefined) ?? null,
    updatedAt: (snapshotData.updatedAt as Timestamp | undefined) ?? null,
    invitedBy: typeof snapshotData.invitedBy === "string" ? snapshotData.invitedBy : null,
    lastLoginAt: (snapshotData.lastLoginAt as Timestamp | undefined) ?? null,
  };
}

export async function getAuthorizedUser(email: string): Promise<AuthorizedUser | null> {
  const normalizedEmail = normalizeEmail(email);
  const snapshot = await getDoc(userDocRef(normalizedEmail));

  if (!snapshot.exists()) {
    return null;
  }

  return serializeUser(snapshot.data(), normalizedEmail);
}

export async function listAuthorizedUsers(): Promise<AuthorizedUser[]> {
  const snapshot = await getDocs(query(collection(firebaseDb, "users"), orderBy("email", "asc")));

  return snapshot.docs.map((userDoc) => serializeUser(userDoc.data(), userDoc.id));
}

export async function ensureBootstrapSuperAdmin(user: User): Promise<AuthorizedUser> {
  const email = user.email ? normalizeEmail(user.email) : null;

  if (email !== bootstrapSuperAdminEmail) {
    throw new Error("Bootstrap super admin can only be created for the configured seed account.");
  }

  const ref = userDocRef(email);
  const existing = await getDoc(ref);

  await setDoc(
    ref,
    {
      uid: user.uid,
      email,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      role: "super_admin",
      status: "active",
      createdAt: existing.exists() ? existing.data().createdAt ?? serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
      invitedBy: existing.exists() ? existing.data().invitedBy ?? "bootstrap" : "bootstrap",
      lastLoginAt: serverTimestamp(),
    },
    { merge: true },
  );

  const updated = await getDoc(ref);
  return serializeUser(updated.data() ?? {}, email);
}

export async function syncLoginUser(user: User): Promise<AuthorizedUser | null> {
  const email = user.email ? normalizeEmail(user.email) : null;

  if (!email) {
    return null;
  }

  if (email === bootstrapSuperAdminEmail) {
    return ensureBootstrapSuperAdmin(user);
  }

  const existing = await getAuthorizedUser(email);

  if (!existing) {
    return null;
  }

  await updateDoc(userDocRef(email), {
    uid: user.uid,
    displayName: user.displayName ?? existing.displayName ?? null,
    photoURL: user.photoURL ?? existing.photoURL ?? null,
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  });

  return getAuthorizedUser(email);
}

export async function createAuthorizedUser(input: {
  email: string;
  displayName?: string;
  photoURL?: string | null;
  uid?: string | null;
  role: UserRole;
  status?: UserStatus;
  invitedBy?: string | null;
}) {
  const email = normalizeEmail(input.email);

  await setDoc(
    userDocRef(email),
    {
      uid: input.uid ?? null,
      email,
      displayName: input.displayName?.trim() || null,
      photoURL: input.photoURL ?? null,
      role: input.role,
      // Pending is the safest default because it records authorization intent without granting access.
      status: input.status ?? "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      invitedBy: input.invitedBy ?? null,
      lastLoginAt: null,
    },
    { merge: false },
  );
}

export async function updateAuthorizedUser(
  email: string,
  updates: Partial<Pick<AuthorizedUser, "role" | "status" | "displayName">>,
) {
  await updateDoc(userDocRef(email), {
    ...updates,
    displayName: updates.displayName?.trim() || updates.displayName || null,
    updatedAt: serverTimestamp(),
  });
}

// Server-side only — used by pipeline to fetch reviewer emails
export async function listAuthorizedUsersAdmin(): Promise<AuthorizedUser[]> {
  const { adminDb } = await import("./firebaseAdmin");
  const snap = await adminDb.collection("users").orderBy("email", "asc").get();
  return snap.docs.map((d) => serializeUser(d.data(), d.id));
}
