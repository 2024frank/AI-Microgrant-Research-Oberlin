import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminAuth } from "@/lib/firebase-admin";

const ADMIN_EMAIL = "frankkusiap@gmail.com";
const COLLECTIONS = ["review_queue", "rejected", "duplicates", "syncs"];

async function deleteCollection(colName: string) {
  const db = getAdminDb();
  const snap = await db.collection(colName).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

export async function POST(req: NextRequest) {
  try {
    const { idToken, collections } = await req.json();
    if (!idToken) return NextResponse.json({ error: "Missing idToken" }, { status: 400 });

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    if (decoded.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const targets: string[] = collections || COLLECTIONS;
    const results: Record<string, number> = {};
    for (const col of targets) {
      results[col] = await deleteCollection(col);
    }

    return NextResponse.json({ ok: true, deleted: results });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
