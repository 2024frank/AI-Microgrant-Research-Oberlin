import type { User } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";

import { normalizeEmail } from "./userIds";

export type UserRole = "super_admin" | "admin" | "reviewer" | "viewer";
export type UserStatus = "active" | "pending" | "disabled";

export type AuthorizedUser = {
  uid: string | null;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: number | null;
  updatedAt: number | null;
  invitedBy: string | null;
  lastLoginAt: number | null;
};

export const allowedRoles: UserRole[] = ["super_admin", "admin", "reviewer", "viewer"];
export const allowedStatuses: UserStatus[] = ["active", "pending", "disabled"];

export { bootstrapSuperAdminEmail, normalizeEmail } from "./userIds";

export function canAccessAdminControl(role: UserRole | null): boolean {
  return role === "super_admin" || role === "admin";
}

async function bearerHeaders(user: User) {
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  } as const;
}

export async function syncLoginUser(user: User): Promise<AuthorizedUser | null> {
  const res = await fetch("/api/auth/sync", {
    method: "POST",
    headers: await bearerHeaders(user),
  });
  const data = (await res.json()) as { authorizedUser?: AuthorizedUser | null; error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Unable to sync account");
  }
  return data.authorizedUser ?? null;
}

export async function getAuthorizedUser(email: string): Promise<AuthorizedUser | null> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch(`/api/admin/users?email=${encodeURIComponent(normalizeEmail(email))}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Unable to load user");
  }
  const data = (await res.json()) as { user: AuthorizedUser | null };
  return data.user;
}

export async function listAuthorizedUsers(): Promise<AuthorizedUser[]> {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch("/api/admin/users", {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Unable to list users");
  }
  const data = (await res.json()) as { users: AuthorizedUser[] };
  return data.users;
}

export async function ensureBootstrapSuperAdmin(user: User): Promise<AuthorizedUser> {
  const synced = await syncLoginUser(user);
  if (!synced) {
    throw new Error("Bootstrap account could not be provisioned.");
  }
  return synced;
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
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: await bearerHeaders(user),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Unable to create user");
  }
}

export async function updateAuthorizedUser(
  email: string,
  updates: Partial<Pick<AuthorizedUser, "role" | "status" | "displayName">>,
) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch("/api/admin/users", {
    method: "PATCH",
    headers: await bearerHeaders(user),
    body: JSON.stringify({ email, updates }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Unable to update user");
  }
}

export async function deleteAuthorizedUser(email: string) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch(`/api/admin/users?email=${encodeURIComponent(normalizeEmail(email))}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Unable to delete user");
  }
}
