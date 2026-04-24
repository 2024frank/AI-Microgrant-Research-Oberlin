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

    const docRef = getAdminDb().collection("allowed_users").doc(email);
    const existing = await docRef.get();
    if (existing.exists) {
      return NextResponse.json({ error: "User already exists" }, { status: 409 });
    }

    await docRef.set({
      email,
      role: "user",
      addedAt: new Date().toISOString(),
      addedBy: ADMIN_EMAIL,
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
