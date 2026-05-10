import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

async function clearCollection(name: string) {
  const snap = await adminDb.collection(name).limit(500).get();
  if (snap.empty) return 0;
  const batch = adminDb.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

export async function POST() {
  try {
    const [posts, dupes, processed, jobs, feedback] = await Promise.all([
      clearCollection("reviewPosts"),
      clearCollection("duplicateGroups"),
      clearCollection("processedEventIds"),
      clearCollection("pipelineJobs"),
      clearCollection("postFeedback"),
    ]);

    return NextResponse.json({
      success: true,
      cleared: { posts, duplicates: dupes, processedIds: processed, jobs, feedback },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reset failed" },
      { status: 500 }
    );
  }
}
