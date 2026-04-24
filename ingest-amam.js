/**
 * AMAM Event Ingester — amam_camoufox_v1
 * Adapter for: Allen Memorial Art Museum (AMAM)
 * Listing URL: https://amam.oberlin.edu/exhibitions-events/events
 *
 * Uses Playwright (Chromium) as the headless renderer.
 * Run: node --env-file=.env ingest-amam.js
 */

import { chromium } from "playwright";
import crypto from "crypto";

const SOURCE = {
  id: "amam",
  source_name: "Allen Memorial Art Museum (AMAM)",
  adapter_key: "amam_camoufox_v1",
  listing_url: "https://amam.oberlin.edu/exhibitions-events/events",
  attribution_label: "Allen Memorial Art Museum",
  default_location: "87 N. Main St., Oberlin, OH 44074",
  default_email: "fkusiapp@oberlin.edu",
  default_phone: "440.775.8665",
};

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

/**
 * Parse AMAM date line.
 * Examples:
 *   "TUESDAY, APRIL 14, 2026 AT 3:00 P.M. - 4:00 P.M."
 *   "FRIDAY, MAY 2, 2026"
 *   "APRIL 14 – MAY 30, 2026" (exhibition range)
 */
function parseDateLine(line) {
  if (!line) return { start_datetime: null, end_datetime: null };

  // Normalise: strip "AT", P.M./A.M. → PM/AM, en-dash → hyphen
  const norm = line
    .replace(/\bAT\b/gi, "")
    .replace(/P\.M\./gi, "PM")
    .replace(/A\.M\./gi, "AM")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  // Try "DAY, MONTH DD, YYYY HH:MM PM - HH:MM PM"
  const fullRe =
    /(?:[A-Z]+,\s+)?([A-Z]+ \d{1,2},?\s+\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)(?:\s*-\s*(\d{1,2}:\d{2}\s*[AP]M))?/i;
  const m = norm.match(fullRe);
  if (m) {
    const base = m[1].replace(/,/, "");
    const start = new Date(`${base} ${m[2]}`);
    const end = m[3] ? new Date(`${base} ${m[3]}`) : null;
    if (!isNaN(start.getTime())) {
      return {
        start_datetime: start.toISOString(),
        end_datetime: end && !isNaN(end.getTime()) ? end.toISOString() : null,
      };
    }
  }

  // Try "DAY, MONTH DD, YYYY" (no time)
  const dateOnlyRe = /(?:[A-Z]+,\s+)?([A-Z]+ \d{1,2},?\s+\d{4})/i;
  const m2 = norm.match(dateOnlyRe);
  if (m2) {
    const d = new Date(m2[1].replace(/,/, ""));
    if (!isNaN(d.getTime())) {
      return { start_datetime: d.toISOString(), end_datetime: null };
    }
  }

  return { start_datetime: null, end_datetime: null };
}

// ─── Scraper ──────────────────────────────────────────────────────────────────

async function scrapeAMAM() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    const page = await context.newPage();

    console.log("→ Opening", SOURCE.listing_url);
    await page.goto(SOURCE.listing_url, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(4000);

    // ── Extract raw rows ────────────────────────────────────────────────────
    const rawRows = await page.evaluate(() => {
      const results = [];

      // Try selector variants in priority order
      const selectors = ["a.event", "a.event-card", ".event-listing a", "article.event a", ".views-row a"];
      let els = [];
      for (const sel of selectors) {
        els = [...document.querySelectorAll(sel)];
        if (els.length > 0) break;
      }

      // Fallback: any <a> that looks like an event link
      if (els.length === 0) {
        els = [...document.querySelectorAll("a[href*='/event']")];
      }

      console.log(`Found ${els.length} elements`);

      for (const el of els) {
        const text = el.innerText || el.textContent || "";
        const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

        // Find the date line (contains a weekday)
        const dateLine = lines.find(l =>
          /\b(MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\b/i.test(l)
        ) || null;

        // Title: first non-date, non-short line
        const nonDateLines = lines.filter(l => l !== dateLine && l.length > 3);
        const title = nonDateLines[0] || null;

        // Description: remaining lines after title
        const descLines = nonDateLines.slice(1);
        const desc = descLines.join(" ").trim() || null;

        const img = el.querySelector("img");

        results.push({
          href: el.href || null,
          dateLine,
          title,
          desc,
          img: img?.src || img?.dataset?.src || null,
        });
      }

      return results;
    });

    console.log(`→ Scraped ${rawRows.length} raw rows`);

    // Dump the page HTML if nothing found (for debugging selector issues)
    if (rawRows.length === 0) {
      const html = await page.content();
      const snippet = html.slice(0, 3000);
      console.log("⚠ No rows found. Page snippet:\n", snippet);
    }

    return rawRows;
  } finally {
    await browser.close();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rawRows = await scrapeAMAM();
  const now = new Date().toISOString();

  const stagedEvents = [];
  const candidates = [];

  for (const row of rawRows) {
    if (!row.title) continue;

    const { start_datetime, end_datetime } = parseDateLine(row.dateLine);

    // Drop past events
    if (start_datetime && start_datetime < now) continue;

    const isOnline = /zoom/i.test(row.title + (row.desc || ""));
    const location_type = isOnline ? "Online" : "In-Person";
    const location_or_address = isOnline ? null : SOURCE.default_location;

    const event_link = row.href || SOURCE.listing_url;

    const staged = {
      // Content
      title: row.title,
      organizational_sponsor: SOURCE.attribution_label,
      start_datetime,
      end_datetime,
      location_type,
      location_or_address,
      room_number: null,
      event_link,
      short_description: truncate(row.desc, 200),
      extended_description: row.desc || null,
      artwork_url: row.img || null,

      // Source metadata
      source_id: SOURCE.id,
      source_name: SOURCE.source_name,
      adapter_key: SOURCE.adapter_key,
      source_event_url: event_link,
      listing_url: SOURCE.listing_url,

      // Review fields
      is_duplicate: null,
      duplicate_match_url: null,
      duplicate_reason: null,
      confidence: 0.9,
      review_status: "pending",

      // Raw payload for debugging
      raw_payload: row,
    };

    stagedEvents.push(staged);
    candidates.push({
      external_event_id: null,
      event_url: staged.source_event_url,
      title_hint: staged.title,
      fingerprint: makeFingerprint([SOURCE.id, staged.source_event_url, staged.start_datetime || ""]),
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

  // ── Validation ─────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════");
  console.log(`  AMAM Ingester — ${SOURCE.adapter_key}`);
  console.log("══════════════════════════════════════════");
  console.log(`  Raw rows scraped  : ${rawRows.length}`);
  console.log(`  Eligible events   : ${result.summary.eligible_events}`);
  console.log(`  Candidates        : ${result.candidates.length}`);
  console.log(`  Match (equal?)    : ${candidates.length === stagedEvents.length ? "✓ YES" : "✗ NO"}`);

  if (stagedEvents.length > 0) {
    console.log("\n  Sample events:");
    for (const e of stagedEvents.slice(0, 2)) {
      console.log(`\n  ┌─ ${e.title}`);
      console.log(`  │  start       : ${e.start_datetime || "—"}`);
      console.log(`  │  end         : ${e.end_datetime || "—"}`);
      console.log(`  │  location    : ${e.location_or_address || e.location_type}`);
      console.log(`  │  event_link  : ${e.event_link}`);
      console.log(`  │  artwork_url : ${e.artwork_url || "—"}`);
      console.log(`  └─ desc        : ${(e.short_description || "—").slice(0, 80)}`);
    }
  } else {
    console.log("\n  ⚠ No future events found. Check selector or date parsing.");
  }

  console.log("\n══════════════════════════════════════════\n");
  return result;
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
