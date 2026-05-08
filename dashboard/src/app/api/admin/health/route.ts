import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const ADMIN_EMAIL = "frankkusiap@gmail.com";
const CH_CREATE_API = "https://oberlin.communityhub.cloud/api/legacy/calendar/post/submit";

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();
    if (!idToken) return NextResponse.json({ error: "Missing idToken" }, { status: 400 });

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    if (decoded.email !== ADMIN_EMAIL) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const checks: Record<string, unknown> = {
      ok: true,
      at: new Date().toISOString(),
      env: {
        hasFirebaseServiceAccount: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT),
      },
      firestore: { ok: false },
      communityhub: { ok: false },
    };

    // Firestore admin connectivity (no reads of sensitive docs, no secrets returned).
    try {
      const db = getAdminDb();
      await db.collection("health_checks").doc("latest").set(
        { checkedAt: new Date().toISOString() },
        { merge: true }
      );
      checks.firestore = { ok: true };
    } catch (err: unknown) {
      checks.firestore = { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
      checks.ok = false;
    }

    // CommunityHub reachability.
    try {
      // The root domain may legitimately 404; probe a known API path instead.
      // We treat any non-404 response as "reachable" (even 400/405 are fine here).
      const res = await fetch(CH_CREATE_API, { method: "OPTIONS" });
      const reachable = res.status !== 404;
      checks.communityhub = { ok: reachable, status: res.status };
      if (!reachable) checks.ok = false;
    } catch (err: unknown) {
      checks.communityhub = { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
      checks.ok = false;
    }

    return NextResponse.json(checks);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
