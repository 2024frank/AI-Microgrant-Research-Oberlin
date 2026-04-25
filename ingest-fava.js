/**
 * FAVA Gallery Event Ingester — fava_v1
 * Adapter for: FAVA — Fine Arts Association (https://www.favagallery.org/calendar)
 *
 * Approach:
 *   Playwright loads the calendar page, collects event links, visits each
 *   detail page, and extracts structured data with Gemini from innerText.
 *
 * Run: node --env-file=.env ingest-fava.js
 */

import { chromium } from "playwright";
import crypto from "crypto";
import { fileURLToPath } from "url";

const SOURCE = {
  id: "fava",
  source_name: "FAVA — Fine Arts Association",
  adapter_key: "fava_v1",
  listing_url: "https://www.favagallery.org/calendar",
  default_location: "39 S. Main St., Oberlin, OH 44074",
  sponsors: ["FAVA — Fine Arts Association"],
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = "gemini-2.5-flash";

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

// ─── Gemini helpers ───────────────────────────────────────────────────────────

async function geminiCall(prompt) {
  if (!GEMINI_API_KEY) return null;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

async function geminiExtractEvent(pageText, sourceUrl) {
  if (!GEMINI_API_KEY) return null;
  const prompt = `Extract event details from this community event page text. Return ONLY valid JSON, no markdown.

Page URL: ${sourceUrl}
Page text:
"""
${pageText.slice(0, 4000)}
"""

Return this exact JSON structure:
{
  "title": "event title",
  "startDate": "YYYY-MM-DD or ISO string or null",
  "startTime": "HH:MM AM/PM or null",
  "endDate": "YYYY-MM-DD or null",
  "endTime": "HH:MM AM/PM or null",
  "location": "venue name and address or null",
  "description": "2-3 sentence summary under 300 chars",
  "extendedDescription": "full description under 800 chars",
  "imageUrl": "https://... or null",
  "isPublic": true
}`;
  try {
    const raw = await geminiCall(prompt);
    if (!raw) return null;
    return JSON.parse(raw.replace(/```json\n?|```/g, "").trim());
  } catch (err) {
    console.warn(`  Gemini parse error for ${sourceUrl}: ${err.message}`);
    return null;
  }
}

// ─── Collect event URLs from the calendar page ────────────────────────────────

async function collectEventUrls(page) {
  console.log("→ Calendar listing:", SOURCE.listing_url);
  await page.goto(SOURCE.listing_url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2000);

  const allHrefs = new Set();
  let attempts = 0;

  while (true) {
    const hrefs = await page.evaluate(() => {
      const BASE = "https://www.favagallery.org";
      const links = [...document.querySelectorAll("a[href]")]
        .filter(a => {
          const href = a.href || "";
          return (
            (href.includes("favagallery.org") || href.startsWith("/")) &&
            (
              href.includes("/event") ||
              href.includes("/calendar/") ||
              href.includes("/class") ||
              href.includes("/workshop") ||
              href.includes("/exhibition")
            ) &&
            !href.endsWith("/calendar") &&
            !href.endsWith("/calendar/") &&
            !href.includes("#")
          );
        });
      return [...new Set(links.map(a => a.href))];
    });

    const prevSize = allHrefs.size;
    hrefs.forEach(h => allHrefs.add(h));
    const added = allHrefs.size - prevSize;
    console.log(`   Attempt ${attempts + 1}: found ${hrefs.length} links (${added} new, total: ${allHrefs.size})`);

    // Try "next month" / "next page" navigation
    const nextBtn = await page.$(
      "a[aria-label='Next month'], a[aria-label='next'], .calendar-nav-next a, " +
      "a.next, .fc-next-button, button[aria-label='next month'], " +
      ".tribe-events-nav-next a"
    );

    if (!nextBtn || added === 0) break;

    try {
      await nextBtn.click();
      await page.waitForTimeout(2000);
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    } catch {
      break;
    }

    attempts++;
    if (attempts > 5) break; // only look ahead ~6 months
  }

  console.log(`   Total event URLs: ${allHrefs.size}`);
  return [...allHrefs];
}

// ─── Scrape individual detail page ────────────────────────────────────────────

async function scrapeDetail(page, url) {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(2000);

    const pageText = await page.evaluate(() => document.body.innerText || "");
    const imageUrl = await page.evaluate(() => {
      const img = [...document.querySelectorAll("img")]
        .find(i => i.src && !i.src.includes("logo") && !i.src.includes("data:") && i.naturalWidth > 100);
      return img?.src || null;
    });

    const extracted = await geminiExtractEvent(pageText, url);
    if (!extracted || !extracted.title) return null;

    if (!extracted.imageUrl && imageUrl) extracted.imageUrl = imageUrl;
    return { ...extracted, sourceUrl: url };
  } catch (err) {
    console.warn(`  Could not scrape ${url}: ${err.message}`);
    return null;
  }
}

// ─── Parse date strings ────────────────────────────────────────────────────────

function toIso(dateStr, timeStr) {
  if (!dateStr) return null;
  try {
    const combined = timeStr ? `${dateStr} ${timeStr}` : dateStr;
    const d = new Date(combined);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runIngester() {
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

    const eventUrls = await collectEventUrls(page);
    console.log(`\n→ Scraping ${eventUrls.length} detail pages…\n`);

    for (let i = 0; i < eventUrls.length; i++) {
      const url = eventUrls[i];
      const detail = await scrapeDetail(page, url);
      if (!detail || !detail.title) continue;

      const start_datetime = toIso(detail.startDate, detail.startTime);
      const end_datetime   = toIso(detail.endDate, detail.endTime);

      if (start_datetime && start_datetime < now) continue;

      const isOnline = /zoom|virtual|online/i.test(
        (detail.title || "") + " " + (detail.description || "")
      );
      const location_type = isOnline ? "Online" : "In-Person";

      const staged = {
        title: detail.title,
        organizational_sponsor: SOURCE.sponsors[0],
        start_datetime,
        end_datetime,
        location_type,
        location_or_address: isOnline ? null : (detail.location || SOURCE.default_location),
        event_link: url,
        short_description: truncate(detail.description, 200),
        extended_description: truncate(detail.extendedDescription, 800) || detail.description || null,
        _photoUrl: detail.imageUrl || null,

        source_id: SOURCE.id,
        source_name: SOURCE.source_name,
        adapter_key: SOURCE.adapter_key,
        source_event_url: url,
        listing_url: SOURCE.listing_url,
        contact_email: "frankkusiap@gmail.com",
        contact_phone: "",

        is_duplicate: null,
        duplicate_match_url: null,
        duplicate_reason: null,
        confidence: 0.85,
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

      process.stdout.write(`  [${i + 1}/${eventUrls.length}] ${detail.title.slice(0, 60)}\n`);
    }
  } finally {
    await browser.close();
  }

  console.log("\n══════════════════════════════════════════");
  console.log(`  FAVA Gallery Ingester — ${SOURCE.adapter_key}`);
  console.log("══════════════════════════════════════════");
  console.log(`  Total eligible: ${stagedEvents.length}`);
  if (stagedEvents.length > 0) {
    console.log("\n  Sample:");
    for (const e of stagedEvents.slice(0, 3)) {
      console.log(`\n  ┌─ ${e.title}`);
      console.log(`  │  start  : ${e.start_datetime || "—"}`);
      console.log(`  │  end    : ${e.end_datetime || "—"}`);
      console.log(`  └─ desc   : ${(e.short_description || "—").slice(0, 80)}`);
    }
  }
  console.log("\n══════════════════════════════════════════\n");

  return {
    candidates,
    stagedEvents,
    summary: {
      adapter: SOURCE.adapter_key,
      eligible_events: stagedEvents.length,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runIngester().catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
