import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";

const ADMIN_EMAIL = "frankkusiap@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const { email, idToken } = await req.json();
    if (!email || !idToken) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    if (decoded.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (email === ADMIN_EMAIL) {
      return NextResponse.json({ error: "Cannot remove the admin account" }, { status: 400 });
    }

    await getAdminDb().collection("allowed_users").doc(email).delete();

    // Revoke Firebase Auth sessions for this user
    try {
      const user = await getAdminAuth().getUserByEmail(email);
      await getAdminAuth().revokeRefreshTokens(user.uid);
    } catch {
      // User may not have signed in yet — ignore
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
