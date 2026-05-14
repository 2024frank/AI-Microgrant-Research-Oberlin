import { NextRequest, NextResponse } from "next/server";

import { requireActiveAdmin } from "@/lib/adminAuthGuard";
import {
  createAuthorizedUserMysql,
  deleteAuthorizedUserMysql,
  getAuthorizedUserMysql,
  listAuthorizedUsersMysql,
  updateAuthorizedUserMysql,
} from "@/lib/userDirectory";
import { bootstrapSuperAdminEmail, normalizeEmail } from "@/lib/userIds";
import { allowedRoles, allowedStatuses, type UserRole, type UserStatus } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireActiveAdmin(req.headers.get("authorization"));
  if (!guard.ok) return guard.response;

  try {
    const email = req.nextUrl.searchParams.get("email");
    if (email) {
      const user = await getAuthorizedUserMysql(normalizeEmail(email));
      return NextResponse.json({ user });
    }
    const users = await listAuthorizedUsersMysql();
    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load users" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireActiveAdmin(req.headers.get("authorization"));
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json()) as {
      email?: string;
      displayName?: string;
      photoURL?: string | null;
      uid?: string | null;
      role?: UserRole;
      status?: UserStatus;
      invitedBy?: string | null;
    };
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    if (!body.role || !allowedRoles.includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (body.status && !allowedStatuses.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    await createAuthorizedUserMysql({
      email,
      displayName: body.displayName,
      photoURL: body.photoURL,
      uid: body.uid,
      role: body.role,
      status: body.status,
      invitedBy: body.invitedBy ?? guard.actor.email,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create user" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireActiveAdmin(req.headers.get("authorization"));
  if (!guard.ok) return guard.response;

  try {
    const body = (await req.json()) as {
      email?: string;
      updates?: Partial<{ role: UserRole; status: UserStatus; displayName: string }>;
    };
    const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
    if (!email || !body.updates) {
      return NextResponse.json({ error: "email and updates are required" }, { status: 400 });
    }
    if (body.updates.role && !allowedRoles.includes(body.updates.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    if (body.updates.status && !allowedStatuses.includes(body.updates.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    await updateAuthorizedUserMysql(email, body.updates);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update user" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireActiveAdmin(req.headers.get("authorization"));
  if (!guard.ok) return guard.response;

  try {
    const email = req.nextUrl.searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    const normalized = normalizeEmail(email);
    if (normalized === bootstrapSuperAdminEmail) {
      return NextResponse.json({ error: "Cannot delete the primary admin account." }, { status: 400 });
    }
    await deleteAuthorizedUserMysql(normalized);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete user" },
      { status: 500 },
    );
  }
}
