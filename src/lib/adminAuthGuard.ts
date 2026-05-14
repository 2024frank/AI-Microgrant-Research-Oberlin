import "server-only";

import { NextResponse } from "next/server";

import { verifyBearerIdToken } from "./firebaseAdmin";
import { getAuthorizedUserMysql } from "./userDirectory";
import { normalizeEmail } from "./userIds";
import { canAccessAdminControl, type AuthorizedUser } from "./users";

export type AdminGuardResult =
  | { ok: true; actor: AuthorizedUser }
  | { ok: false; response: NextResponse };

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
