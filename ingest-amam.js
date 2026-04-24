/**
 * AMAM Event Ingester — amam_camoufox_v1
 * Adapter for: Allen Memorial Art Museum (AMAM)
 * Listing URL: https://amam.oberlin.edu/exhibitions-events/events
 *
 * Strategy:
 *   1. Load the events listing page and collect all future event URLs.
 *      The listing already shows ALL upcoming events on page-1 load
 *      (the jQuery UI datepicker is only a calendar highlight, not a filter).
 *   2. Visit each individual event detail page to extract title, date/time,
 *      description, and image — much more reliable than parsing the listing HTML.
 *
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
 *   "Friday, May 8, 2026 at 5:30 p.m. - 7:30 p.m."
 *   "TUESDAY, APRIL 14, 2026 AT 3:00 P.M. - 4:00 P.M."
 *   "FRIDAY, MAY 2, 2026"
 */
function parseDateLine(line) {
  if (!line) return { start_datetime: null, end_datetime: null };

  const norm = line
    .replace(/\bAT\b/gi, "")
    .replace(/P\.M\./gi, "PM")
    .replace(/A\.M\./gi, "AM")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  // "DAY, MONTH DD, YYYY HH:MM PM - HH:MM PM"
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

  // "DAY, MONTH DD, YYYY" (no time)
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

// ─── Step 1: Collect all event URLs from the listing page ─────────────────────

async function collectEventUrls(page) {
  console.log("→ Loading events listing:", SOURCE.listing_url);
  await page.goto(SOURCE.listing_url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);

  const hrefs = await page.evaluate(() => {
    const links = [...document.querySelectorAll("a[href*='/events/']")]
      .filter(a => /\/events\/\d{4}\/\d{2}\/\d{2}\//.test(a.href));
    return [...new Set(links.map(a => a.href))];
  });

  console.log(`→ Found ${hrefs.length} event URLs on listing page`);

  // Also try clicking next month to ensure we haven't missed anything
  // (in practice the listing is rolling and shows all events, but let's be safe)
  let nextDisabled = await page.evaluate(() =>
    document.querySelector(".ui-datepicker-next")?.classList.contains("ui-state-disabled") ?? true
  );

  if (!nextDisabled) {
    await page.click(".ui-datepicker-next");
    await page.waitForTimeout(1500);

    const extra = await page.evaluate(() => {
      const links = [...document.querySelectorAll("a[href*='/events/']")]
        .filter(a => /\/events\/\d{4}\/\d{2}\/\d{2}\//.test(a.href));
      return [...new Set(links.map(a => a.href))];
    });

    const before = new Set(hrefs);
    extra.forEach(h => { if (!before.has(h)) hrefs.push(h); });

    if (hrefs.length > before.size) {
      console.log(`→ +${hrefs.length - before.size} extra events found on next month`);
    }
  }

  return hrefs;
}

// ─── Step 2: Scrape each event detail page ────────────────────────────────────

async function scrapeEventDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(800);

    return await page.evaluate((eventUrl) => {
      // Title
      const title = document.querySelector("h1")?.textContent?.trim() || null;
      if (!title) return null;

      // Grab the full inner text of main content
      const mainText = (document.querySelector("main") || document.body)?.innerText || "";

      // Find the date line — the first line after title that contains a month name
      const lines = mainText.split("\n").map(l => l.trim()).filter(Boolean);
      const titleIdx = lines.findIndex(l => l === title || l.includes(title.slice(0, 30)));
      const MONTHS = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/i;
      let dateLine = null;
      for (let i = titleIdx + 1; i < Math.min(titleIdx + 6, lines.length); i++) {
        if (MONTHS.test(lines[i]) && /\d{4}/.test(lines[i])) {
          dateLine = lines[i];
          break;
        }
      }

      // Description — lines after the date line, before any nav boilerplate
      const descStart = dateLine
        ? lines.findIndex(l => l === dateLine) + 1
        : titleIdx + 1;
      const descLines = [];
      for (let i = descStart; i < lines.length && descLines.length < 8; i++) {
        const l = lines[i];
        if (/^(SHARE|FOLLOW|BACK|CONTACT|HOME|©|SUBSCRIBE)/i.test(l)) break;
        if (l.length > 15) descLines.push(l);
      }
      const description = descLines.join(" ").trim() || null;

      // Image — first non-logo img in the page
      const img = [...document.querySelectorAll("img")]
        .find(i => i.src && !i.src.includes("logo") && !i.src.includes("data:") && i.naturalWidth > 100);
      const imgSrc = img?.src || null;

      return { title, dateLine, description, imgSrc, eventUrl };
    }, url);
  } catch (err) {
    console.warn(`  ⚠ Could not scrape ${url}: ${err.message}`);
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const browser = await chromium.launch({ headless: true });
  const now = new Date().toISOString();
  const stagedEvents = [];
  const candidates = [];

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      locale: "en-US",
    });
    const page = await context.newPage();

    // Step 1 — collect event URLs
    const eventUrls = await collectEventUrls(page);

    // Step 2 — scrape each detail page
    console.log(`\n→ Scraping ${eventUrls.length} event detail pages…`);
    let scraped = 0;

    for (const url of eventUrls) {
      const detail = await scrapeEventDetail(page, url);
      if (!detail || !detail.title) continue;
      scraped++;

      const { start_datetime, end_datetime } = parseDateLine(detail.dateLine);

      // Drop past events
      if (start_datetime && start_datetime < now) continue;

      const isOnline = /zoom|virtual|online/i.test(detail.title + (detail.description || ""));
      const location_type = isOnline ? "Online" : "In-Person";
      const location_or_address = isOnline ? null : SOURCE.default_location;

      const staged = {
        title: detail.title,
        organizational_sponsor: SOURCE.attribution_label,
        start_datetime,
        end_datetime,
        location_type,
        location_or_address,
        room_number: null,
        event_link: url,
        short_description: truncate(detail.description, 200),
        extended_description: detail.description || null,
        artwork_url: detail.imgSrc || null,

        source_id: SOURCE.id,
        source_name: SOURCE.source_name,
        adapter_key: SOURCE.adapter_key,
        source_event_url: url,
        listing_url: SOURCE.listing_url,
        contact_email: SOURCE.default_email,
        contact_phone: SOURCE.default_phone,

        is_duplicate: null,
        duplicate_match_url: null,
        duplicate_reason: null,
        confidence: 0.9,
        review_status: "pending",

        raw_payload: detail,
      };

      stagedEvents.push(staged);
      candidates.push({
        external_event_id: null,
        event_url: url,
        title_hint: detail.title,
        fingerprint: makeFingerprint([SOURCE.id, url, start_datetime || ""]),
        raw_payload: { adapter: SOURCE.adapter_key },
      });

      process.stdout.write(`  [${scraped}/${eventUrls.length}] ✓ ${detail.title.slice(0, 55)}\n`);
    }
  } finally {
    await browser.close();
  }

  const result = {
    candidates,
    stagedEvents,
    summary: {
      adapter: SOURCE.adapter_key,
      eligible_events: stagedEvents.length,
    },
  };

  console.log("\n══════════════════════════════════════════");
  console.log(`  AMAM Ingester — ${SOURCE.adapter_key}`);
  console.log("══════════════════════════════════════════");
  console.log(`  Event URLs found   : ${candidates.length + stagedEvents.filter(e => e.start_datetime && e.start_datetime < new Date().toISOString()).length}`);
  console.log(`  Eligible (future)  : ${stagedEvents.length}`);
  console.log(`  Candidates         : ${candidates.length}`);
  console.log(`  Match (equal?)     : ${candidates.length === stagedEvents.length ? "✓ YES" : "✗ NO"}`);

  if (stagedEvents.length > 0) {
    console.log("\n  Sample events:");
    for (const e of stagedEvents.slice(0, 3)) {
      console.log(`\n  ┌─ ${e.title}`);
      console.log(`  │  start       : ${e.start_datetime || "—"}`);
      console.log(`  │  end         : ${e.end_datetime || "—"}`);
      console.log(`  │  event_link  : ${e.event_link}`);
      console.log(`  │  artwork_url : ${e.artwork_url || "—"}`);
      console.log(`  └─ desc        : ${(e.short_description || "—").slice(0, 80)}`);
    }
  } else {
    console.log("\n  ⚠ No future events found.");
  }

  console.log("\n══════════════════════════════════════════\n");
  return result;
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
