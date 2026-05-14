import "server-only";

import { ensureMysqlSchema, getMysqlPool, json, parseJson } from "./mysql";
import { bootstrapSuperAdminEmail, normalizeEmail } from "./userIds";
import type { AuthorizedUser, UserRole, UserStatus } from "./users";
import { allowedRoles, allowedStatuses } from "./users";

function nowMs() {
  return Date.now();
}

function parseUserRow(data: unknown, id: string): AuthorizedUser {
  const o = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const role = allowedRoles.includes(o.role as UserRole) ? (o.role as UserRole) : "viewer";
  const status = allowedStatuses.includes(o.status as UserStatus) ? (o.status as UserStatus) : "pending";
  return {
    uid: typeof o.uid === "string" ? o.uid : null,
    email: typeof o.email === "string" ? o.email : id,
    displayName: typeof o.displayName === "string" ? o.displayName : null,
    photoURL: typeof o.photoURL === "string" ? o.photoURL : null,
    role,
    status,
    createdAt: typeof o.createdAt === "number" ? o.createdAt : null,
    updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : null,
    invitedBy: typeof o.invitedBy === "string" ? o.invitedBy : null,
    lastLoginAt: typeof o.lastLoginAt === "number" ? o.lastLoginAt : null,
  };
}

export async function listAuthorizedUsersMysql(): Promise<AuthorizedUser[]> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT id, data FROM app_users ORDER BY email ASC"
  );
  return rows.map((row) => parseUserRow(row.data, row.id));
}

export async function getAuthorizedUserMysql(email: string): Promise<AuthorizedUser | null> {
  await ensureMysqlSchema();
  const id = normalizeEmail(email);
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT id, data FROM app_users WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows[0]) return null;
  return parseUserRow(rows[0].data, rows[0].id);
}

export async function upsertAuthorizedUserMysql(user: AuthorizedUser): Promise<void> {
  await ensureMysqlSchema();
  const id = normalizeEmail(user.email);
  await getMysqlPool().execute(
    `INSERT INTO app_users (id, data) VALUES (?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE data = VALUES(data)`,
    [id, json({ ...user, email: id })]
  );
}

export async function deleteAuthorizedUserMysql(email: string): Promise<void> {
  await ensureMysqlSchema();
  await getMysqlPool().execute("DELETE FROM app_users WHERE id = ?", [normalizeEmail(email)]);
}

export type AccessRequestRow = {
  id: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  requestedAt: number | null;
  status: "pending" | "approved" | "denied";
  requestedRole: UserRole;
  message: string;
  reviewedBy: string | null;
  reviewedAt: number | null;
};

function parseAccessRow(data: unknown, id: string): AccessRequestRow {
  const o = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  return {
    id,
    email: typeof o.email === "string" ? o.email : id,
    displayName: typeof o.displayName === "string" ? o.displayName : null,
    photoURL: typeof o.photoURL === "string" ? o.photoURL : null,
    requestedAt: typeof o.requestedAt === "number" ? o.requestedAt : null,
    status:
      o.status === "approved" || o.status === "denied" || o.status === "pending" ? o.status : "pending",
    requestedRole: (o.requestedRole as UserRole) ?? "reviewer",
    message: typeof o.message === "string" ? o.message : "",
    reviewedBy: typeof o.reviewedBy === "string" ? o.reviewedBy : null,
    reviewedAt: typeof o.reviewedAt === "number" ? o.reviewedAt : null,
  };
}

export async function listPendingAccessRequestsMysql(): Promise<AccessRequestRow[]> {
  await ensureMysqlSchema();
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT id, data FROM access_requests WHERE status = 'pending' ORDER BY requested_at DESC"
  );
  return rows.map((row) => parseAccessRow(row.data, row.id));
}

export async function getAccessRequestMysql(email: string): Promise<AccessRequestRow | null> {
  await ensureMysqlSchema();
  const id = normalizeEmail(email);
  const [rows] = await getMysqlPool().execute<import("mysql2").RowDataPacket[]>(
    "SELECT id, data FROM access_requests WHERE id = ? LIMIT 1",
    [id]
  );
  if (!rows[0]) return null;
  return parseAccessRow(rows[0].data, rows[0].id);
}

export async function saveAccessRequestMysql(row: AccessRequestRow): Promise<void> {
  await ensureMysqlSchema();
  await getMysqlPool().execute(
    `INSERT INTO access_requests (id, data) VALUES (?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE data = VALUES(data)`,
    [normalizeEmail(row.email), json(row)]
  );
}

export async function ensureBootstrapSuperAdminMysql(input: {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
}): Promise<AuthorizedUser> {
  const email = normalizeEmail(input.email);
  if (email !== bootstrapSuperAdminEmail) {
    throw new Error("Bootstrap super admin can only be created for the configured seed account.");
  }
  const existing = await getAuthorizedUserMysql(email);
  const t = nowMs();
  const next: AuthorizedUser = {
    uid: input.uid,
    email,
    displayName: input.displayName,
    photoURL: input.photoURL,
    role: "super_admin",
    status: "active",
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
    invitedBy: existing?.invitedBy ?? "bootstrap",
    lastLoginAt: t,
  };
  await upsertAuthorizedUserMysql(next);
  return next;
}

export async function touchUserLoginMysql(
  email: string,
  input: { uid: string; displayName: string | null; photoURL: string | null }
): Promise<void> {
  const existing = await getAuthorizedUserMysql(email);
  if (!existing) return;
  const t = nowMs();
  await upsertAuthorizedUserMysql({
    ...existing,
    uid: input.uid,
    ...(input.displayName != null ? { displayName: input.displayName } : {}),
    ...(input.photoURL != null ? { photoURL: input.photoURL } : {}),
    updatedAt: t,
    lastLoginAt: t,
  });
}

export async function createAuthorizedUserMysql(input: {
  email: string;
  displayName?: string;
  photoURL?: string | null;
  uid?: string | null;
  role: UserRole;
  status?: UserStatus;
  invitedBy?: string | null;
}): Promise<void> {
  const email = normalizeEmail(input.email);
  const t = nowMs();
  const user: AuthorizedUser = {
    uid: input.uid ?? null,
    email,
    displayName: input.displayName?.trim() || null,
    photoURL: input.photoURL ?? null,
    role: input.role,
    status: input.status ?? "pending",
    createdAt: t,
    updatedAt: t,
    invitedBy: input.invitedBy ?? null,
    lastLoginAt: null,
  };
  await upsertAuthorizedUserMysql(user);
}

export async function updateAuthorizedUserMysql(
  email: string,
  updates: Partial<Pick<AuthorizedUser, "role" | "status" | "displayName">>,
): Promise<void> {
  const existing = await getAuthorizedUserMysql(email);
  if (!existing) return;
  const t = nowMs();
  const next: AuthorizedUser = {
    ...existing,
    ...(updates.role !== undefined ? { role: updates.role } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.displayName !== undefined
      ? { displayName: updates.displayName?.trim() || null }
      : {}),
    updatedAt: t,
  };
  await upsertAuthorizedUserMysql(next);
}

export async function markAccessRequestReviewedMysql(input: {
  email: string;
  status: "approved" | "denied";
  reviewedBy: string | null;
}): Promise<void> {
  const row = await getAccessRequestMysql(input.email);
  if (!row) return;
  await saveAccessRequestMysql({
    ...row,
    status: input.status,
    reviewedBy: input.reviewedBy,
    reviewedAt: nowMs(),
  });
}

export async function submitAccessRequestMysql(input: {
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
  message?: string;
}): Promise<{ row: AccessRequestRow; alreadyPending: boolean }> {
  const email = normalizeEmail(input.email);
  const existing = await getAccessRequestMysql(email);
  if (existing?.status === "pending") {
    return { row: existing, alreadyPending: true };
  }
  const t = nowMs();
  const row: AccessRequestRow = {
    id: email,
    email,
    displayName: input.displayName ?? null,
    photoURL: input.photoURL ?? null,
    requestedAt: t,
    status: "pending",
    requestedRole: "reviewer",
    message: input.message?.trim() ?? "",
    reviewedBy: null,
    reviewedAt: null,
  };
  await saveAccessRequestMysql(row);
  const saved = await getAccessRequestMysql(email);
  if (!saved) throw new Error("Failed to persist access request");
  return { row: saved, alreadyPending: false };
}
