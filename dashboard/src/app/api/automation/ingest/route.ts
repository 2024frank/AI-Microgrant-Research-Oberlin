import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type JsonRecord = Record<string, unknown>;

type NormalizedEvent = {
  id?: string;
  localistId?: string;
  sourceId?: string;
  source?: string;
  sourceName?: string;
  sourceEventUrl?: string;
  title?: string;
  description?: string;
  startTime?: number;
  endTime?: number;
  localDate?: string;
  localTime?: string;
  locationName?: string;
  locationAddress?: string;
  locationType?: string;
  sponsors?: string[];
  imageUrl?: string;
  categoryHints?: string[];
  raw?: unknown;
  original?: JsonRecord;
  writerPayload?: JsonRecord;
  communityHubPayload?: JsonRecord;
  payload?: JsonRecord;
};

type RejectedEvent = NormalizedEvent & {
  reason?: string;
  publicCheck?: JsonRecord;
};

type DuplicateCandidate = {
  id?: string;
  incomingEvent?: JsonRecord;
  matchedCommunityHubEvent?: JsonRecord;
  eventA?: JsonRecord;
  eventB?: JsonRecord;
  reason?: string;
  confidence?: number;
  status?: string;
  source?: string;
  detectedAt?: string;
};

type AutomationRun = {
  sourceId?: string;
  sourceName?: string;
  status?: "success" | "failed" | "partial";
  startedAt?: string;
  finishedAt?: string;
  found?: number;
  queued?: number;
  rejected?: number;
  duplicates?: number;
  recurringSkipped?: number;
  errors?: string[];
};

type IngestPayload = {
  sourceId?: string;
  sourceName?: string;
  startedAt?: string;
  finishedAt?: string;
  status?: "success" | "failed" | "partial";
  found?: number;
  recurringSkipped?: number;
  errors?: string[];
  queued?: NormalizedEvent[];
  reviewQueue?: NormalizedEvent[];
  rejected?: RejectedEvent[];
  duplicates?: DuplicateCandidate[];
  report?: AutomationRun;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyAutomationToken(req: NextRequest) {
  const expected = process.env.AUTOMATION_INGEST_TOKEN;
  if (!expected) {
    return { ok: false, response: NextResponse.json({ error: "AUTOMATION_INGEST_TOKEN is not configured" }, { status: 500 }) };
  }

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const headerToken = req.headers.get("x-automation-token") ?? "";
  const token = bearer || headerToken;

  if (!token || !timingSafeEqual(token, expected)) {
    return { ok: false, response: unauthorized() };
  }

  return { ok: true };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function compact<T>(items: Array<T | undefined | null | false | "">): T[] {
  return items.filter(Boolean) as T[];
}

function hashId(parts: unknown[]) {
  const basis = parts.map(part => String(part ?? "")).join("|");
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 24);
}

function sourceIdFor(event: NormalizedEvent, fallback?: string) {
  return event.sourceId || event.source || fallback || "unknown_source";
}

function sourceNameFor(event: NormalizedEvent, fallback?: string) {
  return event.sourceName || fallback || sourceIdFor(event);
}

function sourceUrlFor(event: NormalizedEvent) {
  const payload = event.writerPayload || event.communityHubPayload || event.payload || {};
  return event.sourceEventUrl || (event.original?.url as string | undefined) || (payload.calendarSourceUrl as string | undefined) || (payload.website as string | undefined) || "";
}

function eventDocId(event: NormalizedEvent, fallbackSourceId?: string) {
  return event.id || event.localistId || `${sourceIdFor(event, fallbackSourceId)}_${hashId([
    sourceIdFor(event, fallbackSourceId),
    sourceUrlFor(event),
    event.title,
    event.startTime,
    event.localDate,
    event.localTime,
  ])}`;
}

function buildWriterPayload(event: NormalizedEvent, sourceId?: string, sourceName?: string) {
  const existing = event.writerPayload || event.communityHubPayload || event.payload;
  if (existing) {
    const calendarSourceName = existing.calendarSourceName || sourceNameFor(event, sourceName);
    const calendarSourceUrl = existing.calendarSourceUrl || sourceUrlFor(event);
    return { ...existing, calendarSourceName, calendarSourceUrl };
  }

  const startTime = event.startTime ?? Math.floor(Date.now() / 1000);
  const endTime = event.endTime ?? startTime + 3600;
  const location = compact([event.locationName, event.locationAddress]).join(", ");
  const sponsorName = sourceNameFor(event, sourceName);

  return {
    title: event.title ?? "",
    description: event.description ?? "",
    extendedDescription: event.description ?? "",
    location,
    sponsors: event.sponsors?.length ? event.sponsors : [sponsorName],
    contactEmail: "",
    phone: "",
    website: sourceUrlFor(event),
    sessions: [{ startTime, endTime }],
    locationType: event.locationType || "ph2",
    _photoUrl: event.imageUrl || null,
    eventType: "ot",
    postTypeId: [89],
    calendarSourceName: sponsorName,
    calendarSourceUrl: sourceUrlFor(event),
    sourceId: sourceIdFor(event, sourceId),
  };
}

function buildReviewDoc(event: NormalizedEvent, sourceId?: string, sourceName?: string) {
  const writerPayload = buildWriterPayload(event, sourceId, sourceName);
  const id = eventDocId(event, sourceId);
  const eventSourceId = sourceIdFor(event, sourceId);
  const eventSourceName = sourceNameFor(event, sourceName);
  const eventSourceUrl = sourceUrlFor(event);

  return {
    ...event,
    id: undefined,
    localistId: event.localistId || id,
    source: event.source || eventSourceId,
    sourceId: eventSourceId,
    sourceName: eventSourceName,
    sourceEventUrl: eventSourceUrl,
    status: "pending",
    detectedAt: new Date().toISOString(),
    original: event.original || {
      title: event.title ?? "",
      date: event.startTime ? new Date(event.startTime * 1000).toISOString() : event.localDate ?? "",
      location: compact([event.locationName, event.locationAddress]).join(", "),
      description: event.description ?? "",
      sponsors: event.sponsors ?? [],
      url: eventSourceUrl,
      photoUrl: event.imageUrl ?? null,
    },
    writerPayload,
  };
}

function buildRejectedDoc(event: RejectedEvent, sourceId?: string, sourceName?: string) {
  const reviewDoc = buildReviewDoc(event, sourceId, sourceName);
  return {
    localistId: reviewDoc.localistId,
    source: reviewDoc.source,
    sourceId: reviewDoc.sourceId,
    sourceName: reviewDoc.sourceName,
    sourceEventUrl: reviewDoc.sourceEventUrl,
    title: event.title || (reviewDoc.original as JsonRecord).title,
    date: (reviewDoc.original as JsonRecord).date,
    location: (reviewDoc.original as JsonRecord).location,
    description: event.description || (reviewDoc.original as JsonRecord).description,
    reason: event.reason || "excluded",
    publicCheck: event.publicCheck || {},
    original: reviewDoc.original,
    rejectedAt: new Date().toISOString(),
    status: "rejected",
  };
}

function buildDuplicateDoc(candidate: DuplicateCandidate, sourceId?: string) {
  return {
    incomingEvent: candidate.incomingEvent || candidate.eventA || {},
    matchedCommunityHubEvent: candidate.matchedCommunityHubEvent || candidate.eventB || {},
    reason: candidate.reason || "Possible duplicate",
    confidence: candidate.confidence ?? 0,
    status: candidate.status || "pending",
    source: candidate.source || sourceId || "unknown_source",
    detectedAt: candidate.detectedAt || new Date().toISOString(),
  };
}

function reportFromPayload(payload: IngestPayload, queuedCount: number, rejectedCount: number, duplicateCount: number): AutomationRun {
  const report = payload.report || {};
  return {
    sourceId: report.sourceId || payload.sourceId || "unknown_source",
    sourceName: report.sourceName || payload.sourceName || payload.sourceId || "Unknown source",
    status: report.status || payload.status || (report.errors?.length || payload.errors?.length ? "partial" : "success"),
    startedAt: report.startedAt || payload.startedAt || new Date().toISOString(),
    finishedAt: report.finishedAt || payload.finishedAt || new Date().toISOString(),
    found: report.found ?? payload.found ?? queuedCount + rejectedCount + duplicateCount,
    queued: report.queued ?? queuedCount,
    rejected: report.rejected ?? rejectedCount,
    duplicates: report.duplicates ?? duplicateCount,
    recurringSkipped: report.recurringSkipped ?? payload.recurringSkipped ?? 0,
    errors: report.errors || payload.errors || [],
  };
}

async function commitInChunks(writes: Array<(batch: FirebaseFirestore.WriteBatch) => void>) {
  const db = getAdminDb();
  let committed = 0;
  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    for (const write of writes.slice(i, i + 450)) write(batch);
    await batch.commit();
    committed += writes.slice(i, i + 450).length;
  }
  return committed;
}

export async function POST(req: NextRequest) {
  const token = verifyAutomationToken(req);
  if (!token.ok) return token.response;

  try {
    const payload = await req.json() as IngestPayload;
    const db = getAdminDb();
    const sourceId = payload.sourceId || payload.report?.sourceId;
    const sourceName = payload.sourceName || payload.report?.sourceName;

    const queued = [...asArray<NormalizedEvent>(payload.queued), ...asArray<NormalizedEvent>(payload.reviewQueue)];
    const rejected = asArray<RejectedEvent>(payload.rejected);
    const duplicates = asArray<DuplicateCandidate>(payload.duplicates);

    const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];

    for (const event of queued) {
      const docId = eventDocId(event, sourceId);
      const doc = buildReviewDoc(event, sourceId, sourceName);
      writes.push(batch => batch.set(db.collection("review_queue").doc(docId), doc, { merge: true }));
    }

    for (const event of rejected) {
      const docId = eventDocId(event, sourceId);
      const doc = buildRejectedDoc(event, sourceId, sourceName);
      writes.push(batch => batch.set(db.collection("rejected").doc(docId), doc, { merge: true }));
    }

    for (const candidate of duplicates) {
      const docId = candidate.id || `${sourceId || "duplicate"}_${hashId([
        candidate.reason,
        candidate.confidence,
        JSON.stringify(candidate.incomingEvent || candidate.eventA || {}),
        JSON.stringify(candidate.matchedCommunityHubEvent || candidate.eventB || {}),
      ])}`;
      const doc = buildDuplicateDoc(candidate, sourceId);
      writes.push(batch => batch.set(db.collection("duplicates").doc(docId), doc, { merge: true }));
    }

    const report = reportFromPayload(payload, queued.length, rejected.length, duplicates.length);
    writes.push(batch => batch.set(db.collection("automation_runs").doc(), {
      ...report,
      createdAt: FieldValue.serverTimestamp(),
    }));

    await commitInChunks(writes);

    return NextResponse.json({
      ok: true,
      sourceId: report.sourceId,
      wrote: {
        reviewQueue: queued.length,
        rejected: rejected.length,
        duplicates: duplicates.length,
        automationRuns: 1,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown ingest error" },
      { status: 500 },
    );
  }
}
