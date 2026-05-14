import { NextRequest, NextResponse } from "next/server";

import { verifyBearerIdToken } from "@/lib/firebaseAdmin";
import {
  ensureBootstrapSuperAdminMysql,
  getAuthorizedUserMysql,
  touchUserLoginMysql,
} from "@/lib/userDirectory";
import { bootstrapSuperAdminEmail, normalizeEmail } from "@/lib/userIds";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const decoded = await verifyBearerIdToken(req.headers.get("authorization"));
    if (!decoded?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const email = normalizeEmail(decoded.email);
    const displayName =
      typeof decoded.name === "string" && decoded.name.trim() ? decoded.name.trim() : null;
    const photoURL =
      typeof decoded.picture === "string" && decoded.picture.trim() ? decoded.picture.trim() : null;
    const profile = {
      uid: decoded.uid,
      email,
      displayName,
      photoURL,
    };

    if (email === bootstrapSuperAdminEmail) {
      const authorizedUser = await ensureBootstrapSuperAdminMysql(profile);
      return NextResponse.json({ authorizedUser });
    }

    const existing = await getAuthorizedUserMysql(email);
    if (!existing) {
      return NextResponse.json({ authorizedUser: null });
    }

    await touchUserLoginMysql(email, profile);
    const authorizedUser = await getAuthorizedUserMysql(email);
    return NextResponse.json({ authorizedUser });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
