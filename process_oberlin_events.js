#!/usr/bin/env node
/**
 * process_oberlin_events.js
 *
 * Reads oberlin_college_events.json, normalizes events, deduplicates against
 * Firestore and CommunityHub, and writes review-ready events to Firestore.
 *
 * NON-NEGOTIABLE RULES:
 * - Never print or expose secrets
 * - Never clear/purge/reset Firestore
 * - Only write to: review_queue, duplicates, rejected, automation_runs,
 *   source_state_oberlin_college_processed
 * - Do not write to any other collection
 */

"use strict";

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const https = require("https");
const http = require("http");

const admin = require(path.join(__dirname, "node_modules", "firebase-admin"));

// ── Constants ────────────────────────────────────────────────────────────────
const SOURCE = "oberlin_college";
const SOURCE_NAME = "Oberlin College";
const FALLBACK_EMAIL = "frankkusiap@gmail.com";
const INPUT_FILE = path.join(__dirname, "oberlin_college_events.json");
const CH_POSTS_URL =
  "https://oberlin.communityhub.cloud/api/legacy/calendar/posts?limit=10000&page=0&filter=future&tab=main-feed&isJobs=false&order=ASC&postType=All&allPosts";

const CATEGORY_IDS = {
  music_performance: 9,
  exhibit: 2,
  workshop_class: 7,
  tour_open_house: 4,
  lecture_talk: 5,
  film: 6,
  theater: 8,
  sports: 3,
  other: 89,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function sha256(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

function normalizeStr(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Title similarity using Levenshtein for short strings, Jaccard for long.
 * Returns [0..1].
 */
function titleSimilarity(a, b) {
  const na = normalizeStr(a);
  const nb = normalizeStr(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;

  if (na.length > 80 || nb.length > 80) {
    const sa = new Set(na.split(" ").filter(Boolean));
    const sb = new Set(nb.split(" ").filter(Boolean));
    const inter = [...sa].filter(x => sb.has(x)).length;
    const union = sa.size + sb.size - inter;
    return union === 0 ? 0 : inter / union;
  }

  const m = na.length;
  const n = nb.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        na[i - 1] === nb[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return 1 - dp[m][n] / Math.max(m, n);
}

function isDuplicateCandidate(candidate, existing) {
  const titleSim = titleSimilarity(
    candidate.title || "",
    existing.title || existing.name || ""
  );
  if (titleSim < 0.75) return false;

  const cStart = candidate.startTime;
  const eStart = existing.startTime || existing.start || 0;

  // Normalize eStart to unix seconds if it's an ISO string
  let eStartSecs = eStart;
  if (typeof eStart === "string" && eStart.length > 4) {
    const parsed = new Date(eStart).getTime();
    if (!isNaN(parsed)) eStartSecs = Math.floor(parsed / 1000);
  } else if (typeof eStart === "number" && eStart > 1e12) {
    eStartSecs = Math.floor(eStart / 1000);
  }

  if (!cStart || !eStartSecs) return titleSim >= 0.9;
  return Math.abs(cStart - eStartSecs) <= 12 * 3600;
}

function inferPostTypeIds(title = "", description = "", eventTypes = []) {
  const text = `${title}\n${description}\n${eventTypes.join(" ")}`.toLowerCase();
  const has = (...kw) => kw.some(k => text.includes(k));

  if (has("concert", "orchestra", "recital", "ensemble", "choir", "opera",
          "symphony", "philharmonic", "jazz", "string quartet", "piano recital",
          "music performance", "musical"))
    return [CATEGORY_IDS.music_performance];
  if (has("exhibit", "exhibition", "gallery", "museum", "installation", "art show"))
    return [CATEGORY_IDS.exhibit];
  if (has("workshop", "class", "lesson", "training", "seminar", "lab", "clinic"))
    return [CATEGORY_IDS.workshop_class];
  if (has("tour", "open house", "walkthrough", "visit"))
    return [CATEGORY_IDS.tour_open_house];
  if (has("lecture", "talk", "symposium", "panel", "presentation", "forum", "discussion"))
    return [CATEGORY_IDS.lecture_talk];
  if (has("film", "movie", "cinema", "screening", "documentary"))
    return [CATEGORY_IDS.film];
  if (has("theater", "theatre", "play", "performance", "drama", "musical", "opera", "dance recital"))
    return [CATEGORY_IDS.theater];
  return [CATEGORY_IDS.other];
}

function cleanDescription(raw, maxLen) {
  if (!raw) return "";
  let text = String(raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/\s*More info:\s*https?:\/\/\S+\s*$/i, "").trim();
  text = text.replace(/\s*For more information[^.]*\.\s*$/i, "").trim();
  if (text.length > maxLen) text = text.slice(0, maxLen - 1).trimEnd() + "…";
  return text;
}

function resolveSourceId(ev) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};

  const candidates = [
    de.id != null ? String(de.id).trim() : null,
    lee.id != null ? String(lee.id).trim() : null,
    le.id != null ? String(le.id).trim() : null,
    ev.source_id != null ? String(ev.source_id).trim() : null,
  ].filter(id => id && id !== "" && id !== "null" && id !== "undefined");

  if (candidates.length === 0) return null;

  const unique = [...new Set(candidates)];
  if (unique.length > 1) return null; // conflicting IDs

  const resolved = unique[0];

  // Verify URL-parsed IDs don't conflict
  const urlCandidates = [
    de.localist_url,
    lee.localist_url,
    ev.eventUrl,
  ].filter(Boolean);

  for (const url of urlCandidates) {
    const m = String(url).match(/\/(\d{8,})(?:\/|$|\?)/);
    if (m && m[1] !== resolved) return null;
  }

  return resolved;
}

function resolveEventUrl(ev, sourceId) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};

  const candidates = [
    de.localist_url,
    lee.localist_url,
    ev.eventUrl,
    de.url,
    lee.url,
  ].filter(Boolean);

  for (const u of candidates) {
    const s = String(u).trim();
    if (/^https?:\/\/.{5,}/.test(s)) return s;
  }

  if (sourceId) return `https://calendar.oberlin.edu/event/${sourceId}`;
  return null;
}

function isAthletics(ev) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};

  const allText = [
    de.title, lee.title, le.title, ev.title,
    JSON.stringify((de.filters || {}).departments || []),
    JSON.stringify((lee.filters || {}).departments || []),
    JSON.stringify((de.filters || {}).event_types || []),
    JSON.stringify((lee.filters || {}).event_types || []),
    JSON.stringify(de.groups || []),
    JSON.stringify(lee.groups || []),
    de.description_text || "",
    lee.description_text || "",
  ].join(" ");

  return /\bathletics\b|\bathletic\b|\bsport(?:ing|s)?\b|\bvarsity\b|\bscrimm|\bteam\b.{0,30}\bvs\.?\b|\bfootball\b|\bbasketball\b|\bsoccer\b|\bswimming\b.*\bmeet\b|\btrack.*field\b|\bwrestling\b|\blacrosse\b|\bvolleyball\b|\bsoftball\b|\bbaseball\b team\b/i.test(allText);
}

function isPublicEvent(ev) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};

  const PUBLIC_LABEL = "Open to all members of the public";

  // Check filters.event_public_events as array of objects
  const dePublicFilters = ((de.filters || {}).event_public_events || []);
  const leePublicFilters = ((lee.filters || {}).event_public_events || []);

  for (const f of [...dePublicFilters, ...leePublicFilters]) {
    const name = typeof f === "string" ? f : (f.name || "");
    if (name === PUBLIC_LABEL) return true;
  }

  // Fallback: infer from text
  const allText = [
    de.title, lee.title, ev.title,
    de.description_text, lee.description_text,
    de.description, lee.description,
    de.location_name, lee.location_name,
  ].join(" ").toLowerCase();

  const publicKeywords = [
    "open to the public",
    "free and open to all",
    "free admission",
    "everyone welcome",
    "all are welcome",
    "open to community",
    "community event",
    "public event",
    "open admission",
    "free to attend",
  ];
  if (publicKeywords.some(k => allText.includes(k))) return true;

  return false;
}

function extractTimes(ev) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};

  const now = Math.floor(Date.now() / 1000);
  let best = null;

  const allInstances = [
    ...(de.event_instances || []),
    ...(lee.event_instances || []),
  ];

  // Dedupe instances by start time
  const seen = new Set();
  for (const inst of allInstances) {
    const ei = inst.event_instance || inst;
    const rawStart = ei.start;
    const rawEnd = ei.end;
    if (!rawStart) continue;
    if (seen.has(rawStart)) continue;
    seen.add(rawStart);

    const startTs = Math.floor(new Date(rawStart).getTime() / 1000);
    if (isNaN(startTs) || startTs <= now) continue;

    const endTs = rawEnd
      ? Math.floor(new Date(rawEnd).getTime() / 1000)
      : startTs + 3600;

    if (!best || startTs < best.start) {
      best = { start: startTs, end: endTs };
    }
  }

  return best;
}

function extractTitle(ev) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};
  return (de.title || lee.title || le.title || ev.title || "").trim();
}

function extractDescriptions(ev) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};

  const rawLong =
    de.description_text || de.description ||
    lee.description_text || lee.description ||
    ev.description || "";

  const rawShort = de.excerpt || lee.excerpt || ev.excerpt || "";

  const extended = cleanDescription(rawLong, 1000);
  let short = cleanDescription(rawShort || rawLong, 200);

  if (short.length < 10 && extended.length >= 10) {
    short = cleanDescription(extended, 200);
  }

  return { short, extended };
}

function extractLocation(ev) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};

  // Prefer location_name, fallback to room+building
  const locationName = de.location_name || lee.location_name || "";
  const roomNumber = de.room_number || lee.room_number || "";
  const address = de.address || lee.address || "";

  if (locationName) return locationName.trim();
  if (roomNumber) return roomNumber.trim();
  if (address) return address.trim();
  return (ev.location || "").trim();
}

function extractContact(ev) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};

  const customFieldsSources = [
    de.custom_fields || {},
    lee.custom_fields || {},
    ev.custom_fields || {},
  ];

  let email = "";
  let phone = "";

  for (const cf of customFieldsSources) {
    if (!email && cf.contact_email_address) {
      email = String(cf.contact_email_address).trim();
    }
    if (!phone && cf.contact_phone_number) {
      phone = String(cf.contact_phone_number).trim();
    }
  }

  if (!email) email = FALLBACK_EMAIL;
  if (!phone) phone = "";

  return { email, phone };
}

function extractSponsors(ev) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};

  const sponsors = new Set([SOURCE_NAME]);

  // Collect department names from filters
  const depts = [
    ...((de.filters || {}).departments || []),
    ...((lee.filters || {}).departments || []),
    ...(de.departments || []),
    ...(lee.departments || []),
    ...(de.groups || []),
    ...(lee.groups || []),
  ];

  for (const d of depts) {
    const name = typeof d === "string" ? d : (d.name || d.department_name || "");
    const trimmed = name.trim();
    if (
      trimmed &&
      trimmed.toLowerCase() !== "athletics" &&
      trimmed.toLowerCase() !== "administrative" &&
      trimmed.length > 2
    ) {
      sponsors.add(trimmed);
    }
  }

  return [...sponsors];
}

function extractEventTypes(ev) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};

  return [
    ...((de.filters || {}).event_types || []),
    ...((lee.filters || {}).event_types || []),
    ...(de.event_types || []),
    ...(lee.event_types || []),
  ]
    .map(t => (typeof t === "string" ? t : t.name || ""))
    .filter(Boolean);
}

function isRecurring(ev) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};

  if (de.recurring === true || lee.recurring === true) return true;

  // Multiple distinct future instances = recurring
  const now = Math.floor(Date.now() / 1000);
  const allInstances = [
    ...(de.event_instances || []),
    ...(lee.event_instances || []),
  ];

  const seen = new Set();
  let futureCount = 0;
  for (const inst of allInstances) {
    const ei = inst.event_instance || inst;
    const rawStart = ei.start;
    if (!rawStart || seen.has(rawStart)) continue;
    seen.add(rawStart);
    const ts = Math.floor(new Date(rawStart).getTime() / 1000);
    if (!isNaN(ts) && ts > now) futureCount++;
    if (futureCount > 1) return true;
  }

  return false;
}

function deriveLocationType(ev) {
  const de = ev.detailEvent || {};
  const le = ev.listEvent || {};
  const lee = le.event || {};

  const experience = de.experience || lee.experience || "";
  if (experience === "virtual" || experience === "online") return "virtual";
  if (experience === "hybrid") return "hybrid";
  return "in_person";
}

// ── Firebase init ─────────────────────────────────────────────────────────────
function initFirebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT env var is not set");
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.firestore();
}

// ── HTTP fetch helper ─────────────────────────────────────────────────────────
function httpGet(urlStr, timeoutMs = 30000) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const mod = parsed.protocol === "https:" ? https : http;
      const req = mod.get(urlStr, { timeout: timeoutMs }, (res) => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(null); }
        });
      });
      req.on("error", () => resolve(null));
      req.on("timeout", () => { req.destroy(); resolve(null); });
    } catch {
      resolve(null);
    }
  });
}

// ── CommunityHub helpers ──────────────────────────────────────────────────────
async function fetchCHPosts() {
  return httpGet(CH_POSTS_URL, 35000);
}

function extractCHPosts(data) {
  if (!data) return [];
  const list =
    data.data || data.posts || data.events || data.results ||
    (Array.isArray(data) ? data : []);
  return list.map(p => ({
    title: p.name || p.title || "",
    startTime: p.startTime || p.start_time || p.start || 0,
    location: p.location || "",
    url: p.website || p.url || "",
  }));
}

// ── Firestore helpers ─────────────────────────────────────────────────────────
async function fetchFirestoreExisting(db) {
  const [rqSnap, dupSnap] = await Promise.all([
    db.collection("review_queue").get(),
    db.collection("duplicates").get(),
  ]);

  const existing = [];

  rqSnap.forEach(doc => {
    const d = doc.data();
    const wp = d.writerPayload || {};
    existing.push({
      title: wp.title || d.title || "",
      startTime:
        (wp.sessions && wp.sessions[0] && wp.sessions[0].startTime) || 0,
      location: wp.location || "",
      url: wp.website || "",
    });
  });

  dupSnap.forEach(doc => {
    const d = doc.data();
    existing.push({
      title: d.title || "",
      startTime: d.startTime || 0,
      location: d.location || "",
      url: d.url || "",
    });
  });

  return existing;
}

async function writeProcessedState(db, processedId, meta) {
  try {
    await db
      .collection("source_state_oberlin_college_processed")
      .doc(processedId)
      .set(
        {
          processedId,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
          ...meta,
        },
        { merge: true }
      );
  } catch {
    // non-fatal
  }
}

async function writeRejected(db, localistId, data) {
  try {
    await db.collection("rejected").doc(localistId).set(
      { ...data, rejectedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  } catch {
    // non-fatal
  }
}

async function writeDuplicate(db, localistId, data) {
  try {
    await db.collection("duplicates").doc(localistId).set(
      {
        ...data,
        status: "pending",
        detectedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // non-fatal
  }
}

// ── Summary printer ───────────────────────────────────────────────────────────
function printSummary({ found, queued, rejected, duplicates, recurringSkipped, errors, inputFileCleared, commitHash }) {
  console.log("=== Oberlin College Events Processing Summary ===");
  console.log(`found:              ${found}`);
  console.log(`queued:             ${queued}`);
  console.log(`rejected:           ${rejected}`);
  console.log(`duplicates:         ${duplicates}`);
  console.log(`recurringSkipped:   ${recurringSkipped}`);
  console.log(`errors:             ${errors.length}`);
  console.log(`input file cleared: ${inputFileCleared}`);
  console.log(`commit hash:        ${commitHash || "none"}`);
  if (errors.length > 0) {
    console.log("\nErrors (first 30):");
    errors.slice(0, 30).forEach((e, i) => console.log(`  [${i + 1}] ${e}`));
    if (errors.length > 30) console.log(`  ... and ${errors.length - 30} more`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const errors = [];
  let found = 0;
  let queued = 0;
  let rejected = 0;
  let duplicates = 0;
  let recurringSkipped = 0;
  let inputFileCleared = false;
  let commitHash = null;

  // 1) Read + parse input file
  let rawEvents = [];
  let fileContent = "";

  try {
    fileContent = fs.existsSync(INPUT_FILE)
      ? fs.readFileSync(INPUT_FILE, "utf8").trim()
      : "";
  } catch (e) {
    errors.push(`Cannot read input file: ${e.message}`);
  }

  if (!fileContent) {
    errors.push("Input file is empty or missing");
    printSummary({ found, queued, rejected, duplicates, recurringSkipped, errors, inputFileCleared, commitHash });
    process.exit(0);
  }

  try {
    const parsed = JSON.parse(fileContent);
    rawEvents = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.events)
      ? parsed.events
      : [];
    found = rawEvents.length;
  } catch (e) {
    errors.push(`Invalid JSON in input file: ${e.message}`);
    printSummary({ found, queued, rejected, duplicates, recurringSkipped, errors, inputFileCleared, commitHash });
    process.exit(1);
  }

  console.log(`[INFO] Loaded ${found} events from input file`);

  // 2) Init Firebase
  let db;
  try {
    db = initFirebase();
    console.log("[INFO] Firebase initialized");
  } catch (e) {
    errors.push(`Firebase init failed: ${e.message}`);
    printSummary({ found, queued, rejected, duplicates, recurringSkipped, errors, inputFileCleared, commitHash });
    process.exit(1);
  }

  // 3) Fetch Firestore existing (review_queue + duplicates)
  let firestoreExisting = [];
  try {
    firestoreExisting = await fetchFirestoreExisting(db);
    console.log(`[INFO] Fetched ${firestoreExisting.length} existing Firestore entries`);
  } catch (e) {
    errors.push(`Firestore existing-docs fetch failed: ${e.message}`);
  }

  // 4) Initial CommunityHub fetch
  console.log("[INFO] Fetching CommunityHub posts (initial)...");
  let chPosts = [];
  const chRaw1 = await fetchCHPosts();
  if (chRaw1) {
    chPosts = extractCHPosts(chRaw1);
    console.log(`[INFO] CommunityHub: ${chPosts.length} posts loaded`);
  } else {
    errors.push("CommunityHub initial fetch failed — dedup may be incomplete");
    console.warn("[WARN] CommunityHub initial fetch returned no data");
  }

  const allExisting = [...firestoreExisting, ...chPosts];

  // 5) Process events
  const processedResults = [];

  for (let idx = 0; idx < rawEvents.length; idx++) {
    const raw = rawEvents[idx] || {};
    const ev = raw;

    // --- Resolve source_id ---
    const sourceId = resolveSourceId(ev);
    if (!sourceId) {
      rejected++;
      errors.push(`Rejected (missing/conflicting source_id): "${extractTitle(ev) || "[unknown]"}"`);
      processedResults.push({ type: "rejected", reason: "missing_source_id", idx });
      continue;
    }

    // --- Athletics hard filter ---
    if (isAthletics(ev)) {
      rejected++;
      errors.push(`Rejected (athletics): ${extractTitle(ev) || sourceId}`);
      processedResults.push({ type: "rejected", reason: "athletics", sourceId, idx });
      continue;
    }

    // --- Recurring skip ---
    if (isRecurring(ev)) {
      recurringSkipped++;
      processedResults.push({ type: "recurring", sourceId, idx });
      continue;
    }

    // --- Resolve event URL ---
    const eventUrl = resolveEventUrl(ev, sourceId);
    if (!eventUrl) {
      rejected++;
      errors.push(`Rejected (missing/malformed URL): ${sourceId}`);
      processedResults.push({ type: "rejected", reason: "bad_url", sourceId, idx });
      continue;
    }

    // --- Time extraction ---
    const times = extractTimes(ev);
    if (!times) {
      rejected++;
      errors.push(`Rejected (no future start time): ${extractTitle(ev) || sourceId}`);
      processedResults.push({ type: "rejected", reason: "no_future_start", sourceId, idx });
      continue;
    }

    // --- Public eligibility ---
    if (!isPublicEvent(ev)) {
      rejected++;
      errors.push(`Rejected (not public): ${extractTitle(ev) || sourceId}`);
      processedResults.push({ type: "rejected", reason: "not_public", sourceId, idx });
      continue;
    }

    // --- Build dedupe keys ---
    const eventKey = `${SOURCE}|${sourceId}|${times.start}`;
    const processedId = sha256(eventKey).slice(0, 32);
    const dedupeHash = processedId;
    const dedupeLabel = eventKey;
    const localistId = `oberlin_college_${sha256(eventKey).slice(0, 24)}`;

    // --- Processed-state hard dedupe ---
    let alreadyProcessed = false;
    try {
      const stateDoc = await db
        .collection("source_state_oberlin_college_processed")
        .doc(processedId)
        .get();
      alreadyProcessed = stateDoc.exists;
    } catch (e) {
      errors.push(`Processed-state check failed for ${sourceId}: ${e.message}`);
    }

    if (alreadyProcessed) {
      processedResults.push({ type: "already_processed", processedId, sourceId, idx });
      continue;
    }

    // --- Extract fields ---
    const title = extractTitle(ev);
    if (!title) {
      rejected++;
      errors.push(`Rejected (no title): ${sourceId}`);
      await writeRejected(db, localistId, { reason: "no_title", sourceId, dedupeLabel, dedupeHash, processedId });
      await writeProcessedState(db, processedId, { reason: "no_title", sourceId });
      processedResults.push({ type: "rejected", reason: "no_title", sourceId, idx });
      continue;
    }

    const { short: description, extended: extendedDescription } = extractDescriptions(ev);
    const location = extractLocation(ev);
    const { email: contactEmail, phone } = extractContact(ev);
    const sponsors = extractSponsors(ev);
    const eventTypes = extractEventTypes(ev);
    const postTypeId = inferPostTypeIds(title, description, eventTypes);
    const locationType = deriveLocationType(ev);

    const effectiveDescription =
      description && description.length >= 10
        ? description
        : cleanDescription(`${title} at Oberlin College.`, 200);

    const effectiveExtended =
      extendedDescription && extendedDescription.length >= 10
        ? extendedDescription
        : effectiveDescription;

    const writerPayload = {
      title,
      description: effectiveDescription,
      extendedDescription: effectiveExtended,
      sponsors,
      contactEmail,
      phone: String(phone || ""),
      website: eventUrl,
      sessions: [{ startTime: times.start, endTime: times.end }],
      locationType,
      location,
      calendarSourceName: SOURCE_NAME,
      calendarSourceUrl: eventUrl,
      postTypeId,
    };

    // CH-shape compatibility validation
    const compatIssues = [];
    if (!writerPayload.title) compatIssues.push("title");
    if (!writerPayload.description || writerPayload.description.length < 10) compatIssues.push("description");
    if (!writerPayload.postTypeId || writerPayload.postTypeId.length === 0) compatIssues.push("postTypeId");
    if (!writerPayload.sessions || writerPayload.sessions.length === 0) compatIssues.push("sessions");
    if (!writerPayload.contactEmail) compatIssues.push("contactEmail");

    if (compatIssues.length > 0) {
      rejected++;
      errors.push(`Rejected (CH-shape incompatible: ${compatIssues.join(", ")}): ${sourceId}`);
      await writeRejected(db, localistId, {
        reason: "ch_shape_incompatible",
        missing: compatIssues,
        sourceId,
        title,
        dedupeLabel,
        dedupeHash,
        processedId,
      });
      await writeProcessedState(db, processedId, { reason: "ch_shape_incompatible", sourceId });
      processedResults.push({ type: "rejected", reason: "ch_shape_incompatible", sourceId, idx });
      continue;
    }

    // --- Initial duplicate check ---
    const candidateForDedupe = {
      title,
      startTime: times.start,
      location,
      url: eventUrl,
    };

    const dupMatch = allExisting.find(e => isDuplicateCandidate(candidateForDedupe, e));
    if (dupMatch) {
      duplicates++;
      await writeDuplicate(db, localistId, {
        title,
        startTime: times.start,
        reason: "duplicate",
        matchTitle: dupMatch.title,
        matchStartTime: dupMatch.startTime,
        sourceId,
        dedupeLabel,
        dedupeHash,
        processedId,
      });
      await writeRejected(db, localistId, {
        reason: "duplicate",
        matchTitle: dupMatch.title,
        matchStartTime: dupMatch.startTime,
        sourceId,
        title,
        dedupeLabel,
        dedupeHash,
        processedId,
      });
      await writeProcessedState(db, processedId, { reason: "duplicate", sourceId, matchTitle: dupMatch.title });
      processedResults.push({ type: "duplicate", sourceId, matchTitle: dupMatch.title, idx });
      continue;
    }

    // --- Mandatory final CommunityHub re-check ---
    const chRaw2 = await fetchCHPosts();
    let chPostsFinal = chPosts; // fallback to initial if re-fetch fails
    if (chRaw2) {
      chPostsFinal = extractCHPosts(chRaw2);
    } else {
      errors.push(`Final CH re-check fetch failed for ${sourceId} — using cached posts`);
    }

    const finalDupMatch = chPostsFinal.find(e => isDuplicateCandidate(candidateForDedupe, e));
    if (finalDupMatch) {
      duplicates++;
      await writeDuplicate(db, localistId, {
        title,
        startTime: times.start,
        reason: "duplicate_final_ch_recheck",
        matchTitle: finalDupMatch.title,
        matchStartTime: finalDupMatch.startTime,
        sourceId,
        dedupeLabel,
        dedupeHash,
        processedId,
      });
      await writeRejected(db, localistId, {
        reason: "duplicate",
        detail: "found_in_final_ch_recheck",
        matchTitle: finalDupMatch.title,
        matchStartTime: finalDupMatch.startTime,
        sourceId,
        title,
        dedupeLabel,
        dedupeHash,
        processedId,
      });
      await writeProcessedState(db, processedId, { reason: "duplicate_final_ch_recheck", sourceId, matchTitle: finalDupMatch.title });
      processedResults.push({ type: "duplicate", sourceId, matchTitle: finalDupMatch.title, finalRecheck: true, idx });
      continue;
    }

    // --- Write to review_queue ---
    try {
      await db.collection("review_queue").doc(localistId).set(
        {
          localistId,
          source: SOURCE,
          sourceName: SOURCE_NAME,
          sourceId,
          status: "pending",
          dedupeLabel,
          dedupeHash,
          processedId,
          original: {
            url: eventUrl,
            title,
            location,
          },
          writerPayload,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      await writeProcessedState(db, processedId, { reason: "queued", sourceId });
      queued++;
      processedResults.push({ type: "queued", sourceId, localistId, idx });
    } catch (e) {
      errors.push(`Failed to write review_queue for ${sourceId}: ${e.message}`);
      processedResults.push({ type: "error", sourceId, error: e.message, idx });
    }
  }

  // 6) Write automation_runs doc
  const runStatus =
    errors.length === 0
      ? "success"
      : queued > 0 || duplicates > 0
      ? "partial"
      : "failed";

  try {
    await db.collection("automation_runs").add({
      sourceId: SOURCE,
      sourceName: SOURCE_NAME,
      status: runStatus,
      found,
      queued,
      rejected,
      duplicates,
      recurringSkipped,
      errors,
      runAt: admin.firestore.FieldValue.serverTimestamp(),
      runAtISO: new Date().toISOString(),
    });
    console.log("[INFO] automation_runs doc written");
  } catch (e) {
    errors.push(`Failed to write automation_runs: ${e.message}`);
  }

  // 7) Update input file and commit
  try {
    // Determine which events were not finalized (errored only)
    const erroredIdxs = new Set(
      processedResults
        .filter(r => r.type === "error")
        .map(r => r.idx)
    );

    const unprocessed = rawEvents.filter((_, i) => erroredIdxs.has(i));
    const finalEvents = unprocessed; // empty on clean run

    const outData = {
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      target: "normalizer_input",
      events: finalEvents,
    };

    fs.writeFileSync(INPUT_FILE, JSON.stringify(outData, null, 2), "utf8");
    inputFileCleared = finalEvents.length === 0;

    const { execSync } = require("child_process");
    execSync(`git -C "${__dirname}" add oberlin_college_events.json`, { stdio: "pipe" });
    try {
      execSync(
        `git -C "${__dirname}" commit -m "chore: clear oberlin events input after normalization run"`,
        { stdio: "pipe" }
      );
      commitHash = execSync(
        `git -C "${__dirname}" rev-parse --short HEAD`,
        { encoding: "utf8" }
      ).trim();
    } catch {
      commitHash = "no-change";
    }
  } catch (e) {
    errors.push(`File update/commit failed: ${e.message}`);
  }

  printSummary({ found, queued, rejected, duplicates, recurringSkipped, errors, inputFileCleared, commitHash });
}

main().catch(err => {
  console.error("Fatal:", err.message || err);
  process.exit(1);
});
