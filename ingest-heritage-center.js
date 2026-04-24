/**
 * Oberlin Heritage Center Event Ingester — heritage_center_v1
 * Adapter for: Oberlin Heritage Center
 * Source URLs:
 *   - Events page : https://www.oberlinheritagecenter.org/events/
 *   - AJAX API    : https://www.oberlinheritagecenter.org/wp-admin/admin-ajax.php?action=fetch_Events
 *
 * Uses Gemini url_context tool to fetch and parse events because
 * oberlinheritagecenter.org drops TLS connections from plain HTTP clients.
 * Gemini's infrastructure can reach the site; we parse the result as JSON.
 *
 * Run: node --env-file=.env ingest-heritage-center.js
 */

import crypto from "crypto";

const SOURCE = {
  id: "heritage_center",
  source_name: "Oberlin Heritage Center",
  adapter_key: "heritage_center_v1",
  listing_url: "https://www.oberlinheritagecenter.org/events/",
  attribution_label: "Oberlin Heritage Center",
  default_location: "73½ S. Professor St., Oberlin, OH 44074",
  default_email: "fkusiapp@oberlin.edu",
  default_phone: "440-774-1700",
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFingerprint(parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

function truncate(str, max) {
  if (!str || str.length <= max) return str || null;
  const chunk = str.slice(0, max);
  const lastPeriod = chunk.lastIndexOf(".");
  return lastPeriod > max * 0.5 ? str.slice(0, lastPeriod + 1).trim() : chunk.trimEnd();
}

// ─── Fetch + parse via Gemini url_context ─────────────────────────────────────

async function fetchEventsViaGemini() {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");

  const prompt = `
Visit ${SOURCE.listing_url} and list every event you can find — including any on future pages or linked from this page. Include past and future events (we filter ourselves).

Return a JSON array only — no markdown fences, no explanation.
Each item:
{
  "title": "event name",
  "start_datetime": "ISO 8601 e.g. 2026-05-10T14:00:00, or null",
  "end_datetime": "ISO 8601 or null",
  "description": "short plain-text description or null",
  "event_url": "click the event title link and give me its full URL, or null",
  "image_url": "full URL to the event image or null",
  "location": "specific room/venue if mentioned, or null"
}
If only a date with no time is listed, use T09:00:00. Return [] if no events found.
`.trim();

  const body = {
    tools: [{ url_context: {} }],
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0 },
  };

  console.log("→ Fetching Heritage Center events via Gemini url_context…");

  // Retry up to 3 times on 429 / 503
  let res, attempts = 0;
  while (true) {
    attempts++;
    res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) break;
    if ((res.status === 429 || res.status === 503) && attempts < 3) {
      const wait = attempts * 15000;
      console.log(`  Gemini ${res.status} — retrying in ${wait / 1000}s (attempt ${attempts}/3)…`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text.slice(0, 500)}`);
  }

  const payload = await res.json();
  const candidate = payload.candidates?.[0];
  if (!candidate) throw new Error("Gemini returned no candidates");

  const parts = candidate.content?.parts || [];
  const textPart = parts.find(p => p.text)?.text || "";

  if (!textPart.trim()) {
    console.warn("⚠ Gemini returned an empty response");
    return [];
  }

  // Strip any accidental markdown fences
  const clean = textPart
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  let events;
  try {
    events = JSON.parse(clean);
  } catch {
    // Try to extract a JSON array from the text
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) {
      try { events = JSON.parse(match[0]); } catch { /* fall through */ }
    }
    if (!events) {
      console.error("⚠ Could not parse Gemini response as JSON:\n", textPart.slice(0, 1000));
      throw new Error("Failed to parse Gemini response as JSON array");
    }
  }

  if (!Array.isArray(events)) {
    console.warn("⚠ Gemini returned non-array:", typeof events);
    return [];
  }

  console.log(`→ Gemini extracted ${events.length} raw events`);
  return events;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rawEvents = await fetchEventsViaGemini();
  const now = new Date().toISOString();

  const stagedEvents = [];
  const candidates = [];

  for (const raw of rawEvents) {
    if (!raw.title) continue;

    const start_datetime = raw.start_datetime || null;
    const end_datetime = raw.end_datetime || null;

    // Drop past events
    if (start_datetime && start_datetime < now) continue;

    const isOnline = /zoom|virtual|online/i.test(raw.title + (raw.description || ""));
    const location_type = isOnline ? "Online" : "In-Person";
    const location_or_address = isOnline
      ? null
      : (raw.location
          ? `${raw.location}, ${SOURCE.default_location}`
          : SOURCE.default_location);

    const event_link = raw.event_url || SOURCE.listing_url;

    const staged = {
      // Content
      title: raw.title,
      organizational_sponsor: SOURCE.attribution_label,
      start_datetime,
      end_datetime,
      location_type,
      location_or_address,
      room_number: null,
      event_link,
      short_description: truncate(raw.description, 200),
      extended_description: raw.description || null,
      artwork_url: raw.image_url || null,

      // Source metadata
      source_id: SOURCE.id,
      source_name: SOURCE.source_name,
      adapter_key: SOURCE.adapter_key,
      source_event_url: event_link,
      listing_url: SOURCE.listing_url,

      // Contact defaults
      contact_email: SOURCE.default_email,
      contact_phone: SOURCE.default_phone,

      // Review fields
      is_duplicate: null,
      duplicate_match_url: null,
      duplicate_reason: null,
      confidence: 0.85,
      review_status: "pending",

      // Raw payload for debugging
      raw_payload: raw,
    };

    stagedEvents.push(staged);
    candidates.push({
      external_event_id: null,
      event_url: staged.source_event_url,
      title_hint: staged.title,
      fingerprint: makeFingerprint([
        SOURCE.id,
        staged.source_event_url,
        staged.start_datetime || "",
      ]),
      raw_payload: { adapter: SOURCE.adapter_key },
    });
  }

  const result = {
    candidates,
    stagedEvents,
    summary: {
      adapter: SOURCE.adapter_key,
      eligible_events: stagedEvents.length,
    },
  };

  // ── Validation report ──────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log(`  Heritage Center Ingester — ${SOURCE.adapter_key}`);
  console.log("══════════════════════════════════════════");
  console.log(`  Raw events from Gemini : ${rawEvents.length}`);
  console.log(`  Eligible (future)      : ${result.summary.eligible_events}`);
  console.log(`  Candidates             : ${result.candidates.length}`);
  console.log(`  Match (equal?)         : ${candidates.length === stagedEvents.length ? "✓ YES" : "✗ NO"}`);

  if (stagedEvents.length > 0) {
    console.log("\n  Sample events:");
    for (const e of stagedEvents.slice(0, 3)) {
      console.log(`\n  ┌─ ${e.title}`);
      console.log(`  │  start       : ${e.start_datetime || "—"}`);
      console.log(`  │  end         : ${e.end_datetime || "—"}`);
      console.log(`  │  location    : ${e.location_or_address || e.location_type}`);
      console.log(`  │  event_link  : ${e.event_link}`);
      console.log(`  │  artwork_url : ${e.artwork_url || "—"}`);
      console.log(`  └─ desc        : ${(e.short_description || "—").slice(0, 80)}`);
    }
  } else {
    console.log("\n  ⚠ No future events found.");
    console.log("    Verify Gemini can reach the events page and dates are parseable.");
  }

  console.log("\n══════════════════════════════════════════\n");
  return result;
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
