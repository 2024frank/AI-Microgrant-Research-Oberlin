import { NextRequest, NextResponse } from "next/server";

const CH_API = "https://oberlin.communityhub.cloud/api/legacy/calendar/post/submit";

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const buffer = await res.arrayBuffer();
    return `data:${contentType};base64,${Buffer.from(buffer).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const { payload } = await req.json();

  // Pull out internal helper fields before sending to CommunityHub
  const photoUrl: string | null = payload._photoUrl ?? null;
  delete payload._photoUrl;

  if (photoUrl) {
    const img = await fetchImageAsBase64(photoUrl);
    if (img) payload.image = img;
  }

  const res = await fetch(CH_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `CommunityHub ${res.status}: ${text}` }, { status: 502 });
  }

  return NextResponse.json(await res.json());
}
