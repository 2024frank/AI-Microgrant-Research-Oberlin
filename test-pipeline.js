/**
 * Pipeline test — fetches 2 real Localist events and runs them through
 * the full AI pipeline: Duplicate Agent → Writer Agent → Public Agent → Firestore queue.
 *
 * Run: node --env-file=.env test-pipeline.js
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const LOCALIST_API = "https://calendar.oberlin.edu/api/2/events";
const COMMUNITYHUB_POSTS_API =
  "https://oberlin.communityhub.cloud/api/legacy/calendar/posts?limit=10000&page=0&filter=future&tab=main-feed&isJobs=false&order=ASC&postType=All&allPosts";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

// ─── Firebase ────────────────────────────────────────────────────────────────
function initFirebase() {
  if (getApps().length > 0) return getFirestore();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { console.warn("No FIREBASE_SERVICE_ACCOUNT — Firestore writes skipped."); return null; }
  const serviceAccount = JSON.parse(raw);
  initializeApp({ credential: cert(serviceAccount) });
  return getFirestore();
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function geminiCall(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
  return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

async function writerAgent(rawText, maxChars) {
  if (!rawText?.trim()) return null;
  return geminiCall(`You are cleaning an event description for a community calendar.
- Remove ALL URLs (http/https links)
- Remove streaming video references ("Streaming Video:", "Watch the webcast", "Live stream:")
- Summarize to under ${maxChars} characters, ending at a complete sentence
- Return ONLY the cleaned text — no quotes, no explanation

Description:
"""
${rawText}
"""`);
}

async function duplicateAgent(incoming, existing) {
  const raw = await geminiCall(`Determine if these two events are the SAME real-world event.

Incoming:
- Title: ${incoming.title}
- Date: ${incoming.date}
- Location: ${incoming.location}

Existing on CommunityHub:
- Title: ${existing.title}
- Date: ${existing.date}
- Location: ${existing.location}

Reply JSON only: {"isDuplicate": true, "confidence": 0-100, "reason": "one sentence"}`);
  return JSON.parse((raw || "{}").replace(/```json\n?|```/g, "").trim());
}

async function publicAgent(title, description) {
  const raw = await geminiCall(`You are a public-access filter agent for a community calendar serving the town of Oberlin, Ohio.

The ONLY question: Can a regular Oberlin town resident — someone with ZERO Oberlin College affiliation — walk in and attend this event?

PRIVATE (reject) if ANY of these apply:
- Requires being an Oberlin College student, faculty, staff, or affiliate
- Academic deadlines, grading policies, advising, tutoring, registration
- Department/faculty/staff meetings
- Student org meetings (OSCA, co-ops, student senate, etc.)
- Requires college login, ID card, or enrollment to register or attend
- Described as exclusive to a school or institution group
- Career/recruiting events restricted to enrolled students

PUBLIC (approve) only if a non-affiliated town resident can genuinely attend:
- Open to the Oberlin community or general public with no affiliation required
- Public lectures, performances, concerts, exhibitions, open houses, festivals
- Community events where anyone can walk in

When in doubt, mark PRIVATE. It is better to be too cautious than to post internal school events on a public community calendar.

Title: ${title}
Description: ${description.slice(0, 500)}

Reply JSON only: {"isPublic": true, "confidence": 0-100, "reason": "one sentence"}`);
  return JSON.parse((raw || "{}").replace(/```json\n?|```/g, "").trim());
}

function mightBeDuplicate(incoming, ch) {
  if (!incoming.date || !ch.date || incoming.date !== ch.date) return false;
  // Title overlap is the strongest signal
  const inTitle = new Set(incoming.title.toLowerCase().split(/\W+/).filter(w => w.length > 3));
  const chWords = (ch.title || "").toLowerCase().split(/\W+/).filter(w => w.length > 3);
  if (chWords.some(w => inTitle.has(w))) return true;
  // Fall back to location overlap
  const a = (incoming.location || "").toLowerCase();
  const b = (ch.location || "").toLowerCase();
  if (!a || !b) return true;
  const aW = new Set(a.split(/\W+/).filter(w => w.length > 3));
  return b.split(/\W+/).filter(w => w.length > 3).some(w => aW.has(w));
}

function divider(label) {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${label}`);
  console.log("═".repeat(60));
}

function section(label) {
  console.log(`\n  ┌─ ${label}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const db = initFirebase();

  console.log("Fetching CommunityHub events…");
  const chRes = await fetch(COMMUNITYHUB_POSTS_API, { headers: { "User-Agent": "test-bot/1.0" } });
  const chData = await chRes.json();
  const chEvents = (chData.posts || []).map(p => ({
    id: p.id,
    title: p.name || "",
    date: p.sessions?.[0]?.start ? new Date(p.sessions[0].start * 1000).toISOString().slice(0, 10) : "",
    location: p.location?.name || p.location?.address || "",
    description: p.description || "",
  }));
  console.log(`  → ${chEvents.length} CommunityHub events loaded`);

  console.log("Fetching Localist events…");
  const url = new URL(LOCALIST_API);
  url.searchParams.set("days", "365"); url.searchParams.set("pp", "100"); url.searchParams.set("page", "1");
  const locRes = await fetch(url, { headers: { "User-Agent": "test-bot/1.0" } });
  const locData = await locRes.json();
  const allEvents = (locData.events || []).map(w => w.event).filter(e => e && e.status === "live" && !e.private);

  // Pick 3 events: Tiny Ref Desk (already on CH = duplicate test), P/NP Deadline (private), Passport Café (public)
  const tinyRefDesk = allEvents.find(e => e.title?.includes("Tiny Ref Desk"));
  const pnpDeadline = allEvents.find(e => e.title?.includes("Pass/No Pass"));
  const passportCafe = allEvents.find(e => e.title?.includes("Passport Café"));
  const picked = [tinyRefDesk, pnpDeadline, passportCafe].filter(Boolean);

  console.log(`  → Testing with ${picked.length} events`);
  console.log(`  → Events: ${picked.map(e => '"' + e.title + '"').join(', ')}\n`);


  const results = [];

  for (const e of picked) {
    const id = `test_${e.id}`;
    const inst = e.event_instances?.[0]?.event_instance || {};
    const rawDescription = (e.description_text || e.description || "").replace(/<[^>]*>/g, " ").trim();
    const departments = (e.filters?.departments || []).map(d => d.name);

    const incoming = {
      id: String(e.id),
      title: e.title || "",
      date: inst.start ? new Date(inst.start).toISOString().slice(0, 10) : "",
      location: e.location_name || e.address || e.location || "",
      description: rawDescription.slice(0, 300),
    };

    divider(`EVENT: "${e.title}"`);

    // ── ORIGINAL ──────────────────────────────────────────────────────────────
    section("ORIGINAL");
    console.log(`  │  Title      : ${e.title}`);
    console.log(`  │  Date       : ${inst.start ? new Date(inst.start).toLocaleString() : "—"}`);
    console.log(`  │  Location   : ${incoming.location || "—"}`);
    console.log(`  │  Sponsors   : ${departments.join(", ") || "—"}`);
    console.log(`  │  Description: ${rawDescription.slice(0, 300)}${rawDescription.length > 300 ? "…" : ""}`);
    console.log(`  │  (${rawDescription.length} chars)`);

    // ── STEP 1: DUPLICATE AGENT ────────────────────────────────────────────────
    section("STEP 1 — Duplicate Agent");
    const candidates = chEvents.filter(ch => mightBeDuplicate(incoming, ch));
    console.log(`  │  Pre-filter: ${candidates.length} CommunityHub candidate(s) on same date+location`);

    let isDuplicate = false;
    let dupResult = null;
    let dupMatch = null;

    for (const ch of candidates) {
      console.log(`  │  Checking against: "${ch.title}"…`);
      const result = await duplicateAgent(incoming, ch);
      if (result?.isDuplicate && result.confidence >= 70) {
        isDuplicate = true;
        dupResult = result;
        dupMatch = ch;
        console.log(`  │  ⚠  DUPLICATE (${result.confidence}%): ${result.reason}`);
        break;
      } else {
        console.log(`  │  ✓ Not a duplicate (${result?.confidence ?? 0}%): ${result?.reason ?? "—"}`);
      }
    }
    if (candidates.length === 0) console.log("  │  ✓ No candidates — skipping Gemini check");

    if (isDuplicate) {
      console.log(`  │\n  └─ RESULT: BLOCKED (duplicate of "${dupMatch.title}")`);
      results.push({ title: e.title, outcome: "duplicate", reason: dupResult.reason });

      if (db) {
        const dupRecord = {
          eventA: incoming,
          eventB: { id: String(dupMatch.id), source: "communityhub", title: dupMatch.title,
            date: dupMatch.date, location: dupMatch.location, description: dupMatch.description || "" },
          confidence: dupResult.confidence,
          reason: dupResult.reason,
          status: "pending",
          detectedAt: new Date().toISOString(),
        };
        const dupId = `test_${incoming.id}_${dupMatch.id}`;
        await db.collection("duplicates").doc(dupId).set(dupRecord);
        console.log(`  │  → Saved to Firestore duplicates (id: ${dupId})`);
      }
      continue;
    }

    // ── STEP 2: WRITER AGENT ──────────────────────────────────────────────────
    section("STEP 2 — Writer Agent");
    const shortDesc = await writerAgent(rawDescription, 200) || rawDescription.slice(0, 200);
    const longDesc  = await writerAgent(rawDescription, 1000) || rawDescription.slice(0, 1000);

    console.log(`  │  Short description (${shortDesc.length}/200 chars):`);
    console.log(`  │    "${shortDesc}"`);
    console.log(`  │  Extended description (${longDesc.length}/1000 chars):`);
    console.log(`  │    "${longDesc.slice(0, 120)}${longDesc.length > 120 ? "…" : ""}"`);

    // ── STEP 3: PUBLIC AGENT ───────────────────────────────────────────────────
    section("STEP 3 — Public Agent");
    const publicCheck = await publicAgent(e.title, rawDescription);
    const isPublic = publicCheck.isPublic !== false;
    console.log(`  │  isPublic   : ${isPublic} (${publicCheck.confidence}% confidence)`);
    console.log(`  │  Reason     : ${publicCheck.reason}`);

    if (!isPublic && publicCheck.confidence >= 75) {
      console.log(`  │\n  └─ RESULT: REJECTED (private event)`);
      results.push({ title: e.title, outcome: "rejected_private", reason: publicCheck.reason });

      if (db) {
        await db.collection("rejected").doc(id).set({
          localistId: String(e.id),
          source: "localist",
          reason: "private",
          confidence: publicCheck.confidence,
          geminiReason: publicCheck.reason,
          original: { title: e.title, date: inst.start || "", location: incoming.location,
            description: rawDescription.slice(0, 500), sponsors: departments, url: e.localist_url || "" },
          rejectedAt: new Date().toISOString(),
          status: "rejected",
        });
        console.log(`  │  → Saved to Firestore rejected collection (id: ${id})`);
      }
      continue;
    }

    // ── STEP 4: REVIEW QUEUE ───────────────────────────────────────────────────
    section("STEP 4 — Review Queue");

    const writerPayload = {
      eventType: "ot",
      email: e.custom_fields?.contact_email_address || "fkusiapp@oberlin.edu",
      subscribe: true,
      contactEmail: e.custom_fields?.contact_email_address || "fkusiapp@oberlin.edu",
      title: (e.title || "Untitled").slice(0, 60),
      sponsors: departments.length ? departments : ["Oberlin College"],
      postTypeId: [89],
      sessions: [{ startTime: inst.start ? Math.floor(new Date(inst.start).getTime() / 1000) : 0,
                   endTime:   inst.end   ? Math.floor(new Date(inst.end  ).getTime() / 1000) : 0 }],
      description: shortDesc,
      extendedDescription: longDesc,
      locationType: "ph2",
      display: "all",
      screensIds: [],
      public: "1",
      phone: e.custom_fields?.contact_phone_number || "",
      website: e.localist_url || e.url || "https://calendar.oberlin.edu",
      location: incoming.location || "Oberlin, OH",
      placeId: "", placeName: "",
      _photoUrl: e.photo_url || null,
    };

    if (db) {
      await db.collection("review_queue").doc(id).set({
        localistId: String(e.id),
        source: "localist",
        status: "pending",
        detectedAt: new Date().toISOString(),
        publicCheck,
        original: { title: e.title, date: inst.start || "", endDate: inst.end || "",
          location: incoming.location, description: rawDescription,
          sponsors: departments, url: e.localist_url || "", photoUrl: e.photo_url || null,
          experience: e.experience || "inperson" },
        writerPayload,
      });
      console.log(`  │  → Saved to Firestore review_queue (id: ${id})`);
    }

    console.log(`  │\n  └─ RESULT: QUEUED FOR REVIEW ✓`);
    results.push({ title: e.title, outcome: "queued", shortDesc, publicCheck });
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  divider("PIPELINE SUMMARY");
  for (const r of results) {
    const icon = r.outcome === "queued" ? "✓" : r.outcome === "duplicate" ? "⚠" : "✗";
    console.log(`  ${icon}  "${r.title}"`);
    console.log(`       Outcome: ${r.outcome.toUpperCase()}`);
    if (r.outcome === "queued") console.log(`       Short desc: "${r.shortDesc}"`);
    if (r.reason) console.log(`       Reason: ${r.reason}`);
  }
  console.log("\nDone. Check your dashboard → Review Queue / Rejected tabs.\n");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
