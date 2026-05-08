#!/usr/bin/env node
/* eslint-disable no-console */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_DEFS = [
  {
    id: "oberlin_college",
    sourceKey: "localist",
    name: "Oberlin Localist",
    url: "https://calendar.oberlin.edu",
  },
  {
    id: "amam",
    sourceKey: "amam",
    name: "Allen Memorial Art Museum",
    url: "https://amam.oberlin.edu/exhibitions-events/events",
  },
  {
    id: "apollo_theatre",
    sourceKey: "apollo_theatre",
    name: "Apollo Theatre",
    url: "https://www.clevelandcinemas.com/our-locations/x03gq-apollo-theatre/",
  },
  {
    id: "heritage_center",
    sourceKey: "heritage_center",
    name: "Oberlin Heritage Center",
    url: "https://www.oberlinheritagecenter.org/events/",
  },
  {
    id: "oberlin_libcal",
    sourceKey: "oberlin_libcal",
    name: "Oberlin College Libraries",
    url: "https://oberlin.libcal.com/calendar/events",
  },
  {
    id: "fava",
    sourceKey: "fava",
    name: "FAVA Gallery",
    url: "https://www.favagallery.org/calendar",
  },
  {
    id: "oberlin_library",
    sourceKey: "oberlin_library",
    name: "Oberlin Public Library",
    url: "https://www.oberlinlibrary.org/events",
  },
  {
    id: "city_of_oberlin",
    sourceKey: "city_of_oberlin",
    name: "City of Oberlin",
    url: "https://cityofoberlin.com/event/",
  },
  // Experience Oberlin intentionally paused.
];

function parseArgs(argv) {
  const args = {
    dryRun: false,
    only: null,
    daysAhead: 180,
    verbose: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--verbose") args.verbose = true;
    else if (a === "--only") args.only = argv[++i] ?? null;
    else if (a === "--days-ahead") args.daysAhead = Number(argv[++i] ?? "180");
    else if (a === "-h" || a === "--help") {
      console.log(
        [
          "Usage: node scripts/oberlin-community-calendar-collect.mjs [options]",
          "",
          "Options:",
          "  --dry-run             Do not write to Firestore",
          "  --only <sourceId>     Run only one source (e.g. oberlin_college)",
          "  --days-ahead <n>      Limit future window (default 180)",
          "  --verbose             Extra logs (never prints secrets)",
        ].join("\n")
      );
      process.exit(0);
    }
  }
  if (!Number.isFinite(args.daysAhead) || args.daysAhead <= 0) {
    throw new Error("--days-ahead must be a positive number");
  }
  return args;
}

function loadEnvLocal(projectRoot) {
  const envPath = path.join(projectRoot, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function toUnixSeconds(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

function normalizeText(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSimilarity(a, b) {
  const ta = new Set(normalizeText(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeText(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.max(ta.size, tb.size);
}

function isLikelyAthletics(title, description) {
  const text = `${title ?? ""} ${description ?? ""}`.toLowerCase();
  return /\b(athletic|athletics|sports|football|basketball|soccer|baseball|softball|volleyball|lacrosse|tennis|golf|swim|swimming|wrestling|track|cross country)\b/i.test(
    text
  );
}

function makeEventId({ sourceKey, sourceEventId, url, startTime }) {
  const basis = `${sourceKey}|${sourceEventId ?? ""}|${url ?? ""}|${startTime ?? ""}`;
  return `${sourceKey}_${sha256(basis).slice(0, 24)}`;
}

async function fetchText(url, { headers } = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function fetchJson(url, { headers } = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

function extractJsonLdEvents(html) {
  const out = [];
  const matches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of matches) {
    const raw = (m[1] ?? "").trim();
    if (!raw) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const c of candidates) {
      if (!c) continue;
      if (c["@type"] === "Event") out.push(c);
      if (c["@graph"] && Array.isArray(c["@graph"])) {
        for (const g of c["@graph"]) if (g?.["@type"] === "Event") out.push(g);
      }
    }
  }
  return out;
}

function findFirstHref(html, pattern) {
  const re = new RegExp(`<a[^>]+href=["']([^\"']+)["'][^>]*>[^<]*${pattern}[^<]*<\\/a>`, "i");
  const m = html.match(re);
  return m?.[1] ?? null;
}

function discoverIcsUrl(html, baseUrl) {
  const linkMatch = html.match(/<link[^>]+type=["']text\/calendar["'][^>]+href=["']([^"']+)["']/i);
  if (linkMatch?.[1]) return new URL(linkMatch[1], baseUrl).toString();
  const maybe = html.match(/href=["']([^"']+\.ics[^"']*)["']/i);
  if (maybe?.[1]) return new URL(maybe[1], baseUrl).toString();
  return null;
}

function parseIcsEvents(icsText) {
  const events = [];
  const blocks = icsText.split("BEGIN:VEVENT").slice(1);
  for (const block of blocks) {
    const body = block.split("END:VEVENT")[0] ?? "";
    const lines = body
      .split(/\r?\n/)
      .map(l => l.replace(/\r$/, ""))
      .reduce((acc, line) => {
        if (!acc.length) return [line];
        if (line.startsWith(" ") || line.startsWith("\t")) {
          acc[acc.length - 1] += line.slice(1);
          return acc;
        }
        acc.push(line);
        return acc;
      }, []);

    const get = (key) => {
      const line = lines.find(l => l.startsWith(`${key}`));
      if (!line) return null;
      const idx = line.indexOf(":");
      if (idx === -1) return null;
      return line.slice(idx + 1).trim();
    };

    const rrule = get("RRULE");
    if (rrule) {
      events.push({ __recurring: true });
      continue;
    }

    const dtStartRaw = get("DTSTART");
    const dtEndRaw = get("DTEND");
    const summary = get("SUMMARY");
    const description = get("DESCRIPTION");
    const location = get("LOCATION");
    const url = get("URL");
    const uid = get("UID");

    const parseIcsDt = (s) => {
      if (!s) return null;
      // Basic support: YYYYMMDD or YYYYMMDDTHHMMSSZ
      const m = String(s).match(/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2}))?(Z)?$/);
      if (!m) return null;
      const [_, y, mo, d, __t, hh = "00", mm = "00", ss = "00", z] = m;
      const iso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}${z ? "Z" : ""}`;
      const dt = new Date(iso);
      if (Number.isNaN(dt.getTime())) return null;
      return dt.toISOString();
    };

    events.push({
      uid,
      title: summary ?? "",
      description: description ?? "",
      location: location ?? "",
      url: url ?? null,
      start: parseIcsDt(dtStartRaw),
      end: parseIcsDt(dtEndRaw),
      __recurring: false,
    });
  }
  return events;
}

async function fetchCommunityHubAllPosts() {
  const endpoints = [
    "https://oberlin.communityhub.cloud/api/legacy/calendar/post/allPosts",
    "https://oberlin.communityhub.cloud/api/legacy/calendar/post/all",
    "https://oberlin.communityhub.cloud/api/legacy/calendar/post/list",
  ];
  for (const url of endpoints) {
    try {
      const data = await fetchJson(url);
      const posts = data?.allPosts ?? data?.posts ?? data?.data ?? data;
      if (!Array.isArray(posts)) continue;
      return posts.map((p) => ({
        id: String(p?.id ?? p?.post_id ?? p?.uuid ?? ""),
        source: "communityhub",
        title: String(p?.title ?? p?.post_title ?? ""),
        date: String(p?.start_date ?? p?.startDate ?? p?.date ?? ""),
        location: String(p?.location ?? p?.venue ?? ""),
        description: String(p?.description ?? p?.post_content ?? ""),
      }));
    } catch {
      // keep trying
    }
  }
  return [];
}

async function collectLocalist(source, { daysAhead }) {
  // Localist v2 API is typically /api/2/events. We use a simple future window.
  const base = source.url.replace(/\/$/, "");
  const start = new Date();
  const end = new Date(Date.now() + daysAhead * 24 * 3600 * 1000);
  const after = start.toISOString().slice(0, 10);
  const before = end.toISOString().slice(0, 10);

  const events = [];
  let page = 1;
  const perPage = 100;
  while (page <= 10) {
    const url = `${base}/api/2/events?pp=${perPage}&page=${page}&start_date=${after}&end_date=${before}`;
    const json = await fetchJson(url);
    const chunk = json?.events ?? [];
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    for (const e of chunk) events.push(e?.event ?? e);
    if (chunk.length < perPage) break;
    page += 1;
  }

  return events.map((e) => {
    const title = e?.title ?? "";
    const description = e?.description_text ?? e?.description ?? "";
    const url = e?.localist_url ?? e?.url ?? null;
    const location = e?.location_name ?? e?.location ?? "";
    const start = e?.first_date ?? e?.start_date ?? e?.start?.date ?? null;
    const end = e?.last_date ?? e?.end_date ?? e?.end?.date ?? null;
    const audience = Array.isArray(e?.audience) ? e.audience.join(", ") : (e?.audience ?? "");
    const isPublic = /open to all members of the public/i.test(audience) || /open to the public/i.test(audience);
    const recurring = Boolean(e?.recurring) || Boolean(e?.recurrence) || Boolean(e?.event_instances?.length > 1);
    const tags = (e?.tags ?? []).map(t => t?.name ?? t).filter(Boolean);
    const athletics = isLikelyAthletics(title, description) || tags.some(t => /athletic|sports/i.test(String(t)));

    return {
      sourceKey: source.sourceKey,
      sourceEventId: String(e?.id ?? ""),
      title,
      description,
      url,
      location,
      startIso: start,
      endIso: end,
      sponsors: [],
      photoUrl: e?.photo_url ?? null,
      publicHint: isPublic ? { isPublic: true, reason: "Localist audience includes public" } : { isPublic: false, reason: `Localist audience missing public tag (${audience || "none"})` },
      recurring,
      athletics,
    };
  });
}

async function collectJsonLd(source, { daysAhead }) {
  const html = await fetchText(source.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; OberlinCalendarBot/1.0)" } });
  const ld = extractJsonLdEvents(html);
  const now = Date.now();
  const max = now + daysAhead * 24 * 3600 * 1000;

  const items = [];
  for (const e of ld) {
    const title = e?.name ?? "";
    const description = e?.description ?? "";
    const url = e?.url ? String(e.url) : source.url;
    const location = e?.location?.name ?? e?.location?.address?.streetAddress ?? "";
    const startIso = e?.startDate ?? null;
    const endIso = e?.endDate ?? null;
    const startTs = toUnixSeconds(startIso);
    if (!startTs) continue;
    if (startTs * 1000 < now || startTs * 1000 > max) continue;
    items.push({
      sourceKey: source.sourceKey,
      sourceEventId: null,
      title,
      description,
      url,
      location,
      startIso,
      endIso,
      sponsors: [],
      photoUrl: e?.image ? (Array.isArray(e.image) ? e.image[0] : e.image) : null,
      publicHint: { isPublic: true, reason: "Public webpage event listing" },
      recurring: false,
      athletics: isLikelyAthletics(title, description),
    });
  }
  return items;
}

async function collectIcsDiscovered(source, { daysAhead }) {
  const html = await fetchText(source.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; OberlinCalendarBot/1.0)" } });
  const icsUrl = discoverIcsUrl(html, source.url);
  if (!icsUrl) throw new Error(`No .ics feed discovered at ${source.url}`);
  const ics = await fetchText(icsUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; OberlinCalendarBot/1.0)" } });
  const parsed = parseIcsEvents(ics);

  const now = Date.now();
  const max = now + daysAhead * 24 * 3600 * 1000;

  const items = [];
  for (const e of parsed) {
    if (e.__recurring) continue;
    const startTs = toUnixSeconds(e.start);
    if (!startTs) continue;
    if (startTs * 1000 < now || startTs * 1000 > max) continue;
    items.push({
      sourceKey: source.sourceKey,
      sourceEventId: e.uid ?? null,
      title: e.title ?? "",
      description: e.description ?? "",
      url: e.url ?? source.url,
      location: e.location ?? "",
      startIso: e.start,
      endIso: e.end,
      sponsors: [],
      photoUrl: null,
      publicHint: { isPublic: true, reason: "Public calendar feed (.ics)" },
      recurring: false,
      athletics: isLikelyAthletics(e.title, e.description),
      calendarFeedUrl: icsUrl,
    });
  }

  return { items, recurringSkipped: parsed.filter(e => e.__recurring).length, discoveredFeedUrl: icsUrl };
}

async function collectBySource(source, opts) {
  if (source.id === "oberlin_college") return { items: await collectLocalist(source, opts), recurringSkipped: 0 };
  // Prefer JSON-LD where available.
  if (source.id === "amam" || source.id === "fava") return { items: await collectJsonLd(source, opts), recurringSkipped: 0 };
  // Use discovered .ics for feeds where noted.
  if (source.id === "oberlin_libcal" || source.id === "oberlin_library" || source.id === "heritage_center" || source.id === "city_of_oberlin" || source.id === "apollo_theatre") {
    return await collectIcsDiscovered(source, opts);
  }
  return { items: await collectJsonLd(source, opts), recurringSkipped: 0 };
}

function asManifestEntry(event) {
  return {
    id: event.localistId,
    source: event.source,
    title: event.original?.title ?? "",
    date: event.original?.date ?? "",
    location: event.original?.location ?? "",
    description: event.original?.description ?? "",
  };
}

function buildReviewQueueDoc({ sourceKey, sourceName, sourceUrl, item }) {
  const startTime = toUnixSeconds(item.startIso);
  const endTime = toUnixSeconds(item.endIso) ?? (startTime ? startTime + 3600 : null);
  const dateStr = item.startIso ? new Date(item.startIso).toISOString() : "";
  const endDateStr = item.endIso ? new Date(item.endIso).toISOString() : (endTime ? new Date(endTime * 1000).toISOString() : "");

  const localistId = makeEventId({ sourceKey, sourceEventId: item.sourceEventId, url: item.url, startTime });

  const original = {
    title: item.title ?? "",
    date: dateStr,
    endDate: endDateStr,
    location: item.location ?? "",
    description: item.description ?? "",
    sponsors: item.sponsors ?? [],
    url: item.url ?? sourceUrl,
    photoUrl: item.photoUrl ?? null,
    experience: "",
  };

  const writerPayload = {
    title: original.title,
    description: original.description,
    extendedDescription: original.description,
    location: original.location,
    urlLink: original.url,
    sponsors: original.sponsors,
    contactEmail: "",
    phone: "",
    website: original.url,
    sessions: startTime ? [{ startTime, endTime: endTime ?? startTime + 3600 }] : [],
    locationType: "in_person",
    _photoUrl: original.photoUrl,
    calendarSourceName: sourceName,
    calendarSourceUrl: sourceUrl,
  };

  return {
    localistId,
    source: sourceKey,
    source_id: item.sourceEventId ?? null,
    status: "pending",
    detectedAt: new Date().toISOString(),
    original,
    writerPayload,
    publicCheck: {
      isPublic: Boolean(item.publicHint?.isPublic),
      confidence: item.publicHint?.isPublic ? 90 : 20,
      reason: item.publicHint?.reason ?? "No public hint provided",
    },
  };
}

function detectDuplicateCandidates(candidate, existing) {
  const candTitle = candidate.original.title;
  const candStart = toUnixSeconds(candidate.original.date);
  const out = [];
  for (const e of existing) {
    const score = tokenSimilarity(candTitle, e.title) * 100;
    if (score < 72) continue;
    const eStart = toUnixSeconds(e.date);
    const timeOk = candStart && eStart ? Math.abs(candStart - eStart) <= 12 * 3600 : true;
    if (!timeOk) continue;
    out.push({
      eventA: asManifestEntry(candidate),
      eventB: e,
      confidence: Math.round(score),
      reason: "Title token overlap + start-time proximity",
    });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out.slice(0, 3);
}

async function main() {
  const args = parseArgs(process.argv);
  const dashboardRoot = path.resolve(__dirname, "..");
  loadEnvLocal(dashboardRoot);

  const sources = args.only ? SOURCE_DEFS.filter(s => s.id === args.only) : SOURCE_DEFS;
  if (sources.length === 0) throw new Error(`No sources matched --only ${args.only}`);

  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawServiceAccount && !args.dryRun) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not set (set dashboard/.env.local or env). Use --dry-run to skip writes.");
  }

  let db = null;
  let FieldValue = null;
  if (!args.dryRun) {
    const { cert, getApps, initializeApp } = await import("firebase-admin/app");
    const firestore = await import("firebase-admin/firestore");
    FieldValue = firestore.FieldValue;
    const getFirestore = firestore.getFirestore;
    const app =
      getApps().length > 0
        ? getApps()[0]
        : initializeApp({ credential: cert(JSON.parse(rawServiceAccount)) });
    db = getFirestore(app);
  }

  const existingReviewQueue = [];
  const existingDuplicates = [];
  const existingCommunityHub = [];

  if (!args.dryRun) {
    const snap = await db.collection("review_queue").get();
    for (const d of snap.docs) {
      const data = d.data();
      existingReviewQueue.push({
        id: d.id,
        source: data.source ?? "review_queue",
        title: data?.original?.title ?? data?.writerPayload?.title ?? "",
        date: data?.original?.date ?? "",
        location: data?.original?.location ?? "",
        description: data?.original?.description ?? "",
      });
    }
    const dupSnap = await db.collection("duplicates").get();
    for (const d of dupSnap.docs) {
      const data = d.data();
      if (data?.eventA) existingDuplicates.push(data.eventA);
      if (data?.eventB) existingDuplicates.push(data.eventB);
    }
  }

  // CommunityHub posts are best-effort; absence should not fail a run.
  try {
    const posts = await fetchCommunityHubAllPosts();
    for (const p of posts) existingCommunityHub.push(p);
  } catch {
    // ignore
  }

  const existingIndex = [...existingReviewQueue, ...existingDuplicates, ...existingCommunityHub]
    .filter(e => e?.title)
    .map(e => ({
      id: String(e.id ?? ""),
      source: e.source ?? "unknown",
      title: e.title ?? "",
      date: e.date ?? "",
      location: e.location ?? "",
      description: e.description ?? "",
    }));

  for (const source of sources) {
    const runStartedAt = Date.now();
    const report = {
      sourceId: source.id,
      sourceName: source.name,
      finishedAt: new Date().toISOString(),
      status: "success",
      found: 0,
      queued: 0,
      rejected: 0,
      duplicates: 0,
      recurringSkipped: 0,
      errors: [],
    };

    try {
      const result = await collectBySource(source, args);
      const items = result.items ?? [];
      report.found = items.length;
      report.recurringSkipped = result.recurringSkipped ?? 0;

      for (const item of items) {
        const doc = buildReviewQueueDoc({
          sourceKey: source.sourceKey,
          sourceName: source.name,
          sourceUrl: source.url,
          item,
        });

        // Always reject athletics, even if public.
        if (item.athletics) {
          report.rejected += 1;
          if (!args.dryRun) {
            await db.collection("rejected").add({
              localistId: doc.localistId,
              source: doc.source,
              reason: "private",
              confidence: 100,
              geminiReason: "Athletics event (policy: always reject athletics)",
              original: {
                title: doc.original.title,
                date: doc.original.date,
                location: doc.original.location,
                description: doc.original.description,
                sponsors: doc.original.sponsors,
                url: doc.original.url,
              },
              rejectedAt: new Date().toISOString(),
              status: "rejected",
            });
          }
          continue;
        }

        if (!doc.publicCheck.isPublic) {
          report.rejected += 1;
          if (!args.dryRun) {
            await db.collection("rejected").add({
              localistId: doc.localistId,
              source: doc.source,
              reason: "private",
              confidence: doc.publicCheck.confidence,
              geminiReason: doc.publicCheck.reason,
              original: {
                title: doc.original.title,
                date: doc.original.date,
                location: doc.original.location,
                description: doc.original.description,
                sponsors: doc.original.sponsors,
                url: doc.original.url,
              },
              rejectedAt: new Date().toISOString(),
              status: "rejected",
            });
          }
          continue;
        }

        // Skip recurring submissions (RRULE already removed for ICS).
        if (item.recurring) {
          report.recurringSkipped += 1;
          continue;
        }

        const dupCandidates = detectDuplicateCandidates(doc, existingIndex);
        if (dupCandidates.length > 0) {
          report.duplicates += 1;
          const best = dupCandidates[0];
          if (!args.dryRun) {
            await db.collection("duplicates").add({
              ...best,
              status: "pending",
              detectedAt: new Date().toISOString(),
            });
          }
          continue;
        }

        report.queued += 1;
        if (!args.dryRun) {
          await db.collection("review_queue").doc(doc.localistId).set(doc, { merge: true });
        }
      }
    } catch (err) {
      report.status = "failed";
      report.errors.push(err instanceof Error ? err.message : "Unknown error");
    } finally {
      report.finishedAt = new Date().toISOString();
      if (!args.dryRun) {
        await db.collection("automation_runs").add({
          ...report,
          runtimeMs: Date.now() - runStartedAt,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    }

    if (args.verbose || args.dryRun) {
      const line = `[${source.id}] found=${report.found} queued=${report.queued} rejected=${report.rejected} dup=${report.duplicates} recurringSkipped=${report.recurringSkipped} status=${report.status}`;
      console.log(line);
      if (report.errors.length > 0) console.log(`  errors: ${report.errors.join(" | ")}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
