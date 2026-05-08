import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const CH_CREATE_API = "https://oberlin.communityhub.cloud/api/legacy/calendar/post/submit";

export async function POST(req: NextRequest) {
  const { payload } = await req.json();

  const db = getAdminDb();

  // Record the push request in Firestore for auditing/debugging.
  // Never store secrets here (request only includes the CommunityHub payload).
  const pushRef = await db.collection("push_requests").add({
    status: "sent",
    requestedAt: new Date().toISOString(),
    createdAt: FieldValue.serverTimestamp(),
    title: String(payload?.title ?? ""),
    source: String(payload?.calendarSourceName ?? payload?.calendar_source_name ?? ""),
    payload,
  });

  // Pull out the internal helper field and map to the API's image_cdn_url field.
  // The CommunityHub API accepts image URLs directly — no base64 conversion needed.
  const photoUrl: string | null = payload._photoUrl ?? null;
  delete payload._photoUrl;

  if (photoUrl) {
    payload.image_cdn_url = photoUrl;
  }

  // Always submit under the admin Gmail
  payload.email = "frankkusiap@gmail.com";

  const res = await fetch(CH_CREATE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      await pushRef.update({
        status: "error",
        finishedAt: new Date().toISOString(),
        error: `CommunityHub ${res.status}: ${text}`,
      });
    } catch {
      // Non-fatal: avoid masking the upstream failure
    }
    return NextResponse.json(
      { error: `CommunityHub ${res.status}: ${text}` },
      { status: 502 }
    );
  }

  const data = await res.json();

  // Increment the real push counter in Firestore so the Overview dashboard
  // always shows the true number of events submitted to CommunityHub.
  try {
    await db.collection("syncs").doc("global").set(
      {
        totalPushed: FieldValue.increment(1),
        lastPushedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch {
    // Non-fatal — counter miss is better than blocking a successful push
  }

  try {
    await pushRef.update({
      status: "success",
      finishedAt: new Date().toISOString(),
      communityHubResponse: data,
    });
  } catch {
    // Non-fatal
  }

  return NextResponse.json(data);
}
