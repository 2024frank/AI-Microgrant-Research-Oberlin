import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { verifyBearerIdToken } from "./firebaseAdmin";
import { getAuthorizedUserMysql } from "./userDirectory";
import { normalizeEmail } from "./userIds";
import { canAccessAdminControl, type AuthorizedUser, type UserRole } from "./users";

export type AdminGuardResult =
  | { ok: true; actor: AuthorizedUser }
  | { ok: false; response: NextResponse };

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  reviewer: 1,
  admin: 2,
  super_admin: 3,
};

/** Active MySQL-authorized user with at least the given role (hierarchy: viewer < reviewer < admin < super_admin). */
export async function requireActiveAppUser(
  authHeader: string | null,
  minimumRole: UserRole,
): Promise<AdminGuardResult> {
  const decoded = await verifyBearerIdToken(authHeader);
  if (!decoded?.email) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const actor = await getAuthorizedUserMysql(normalizeEmail(decoded.email));
  if (!actor || actor.status !== "active") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (ROLE_RANK[actor.role] < ROLE_RANK[minimumRole]) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, actor };
}

export async function requireActiveSuperAdmin(authHeader: string | null): Promise<AdminGuardResult> {
  return requireActiveAppUser(authHeader, "super_admin");
}

/** Matches `x-cron-secret` to `CRON_SECRET` when the secret is configured (server-to-server). */
export function isValidCronSecret(req: Pick<NextRequest, "headers">): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("x-cron-secret") === secret;
}

export async function requireActiveAdmin(authHeader: string | null): Promise<AdminGuardResult> {
  const decoded = await verifyBearerIdToken(authHeader);
  if (!decoded?.email) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const actor = await getAuthorizedUserMysql(normalizeEmail(decoded.email));
  if (!actor || actor.status !== "active" || !canAccessAdminControl(actor.role)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, actor };
}

export async function requireSignedIn(authHeader: string | null) {
  const decoded = await verifyBearerIdToken(authHeader);
  if (!decoded?.email) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { ok: true as const, decoded };
}
