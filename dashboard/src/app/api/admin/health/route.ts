import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const ADMIN_EMAIL = "frankkusiap@gmail.com";
const CH_HOST = "https://oberlin.communityhub.cloud";

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
        hasGithubPat: Boolean(process.env.GITHUB_PAT),
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
      const res = await fetch(CH_HOST, { method: "HEAD" });
      checks.communityhub = { ok: res.ok, status: res.status };
      if (!res.ok) checks.ok = false;
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

