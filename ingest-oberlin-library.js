/**
 * Oberlin Public Library Event Ingester — oberlin_library_v1
 * Adapter for: Oberlin Public Library (https://www.oberlinlibrary.org/events)
 *
 * Approach:
 *   Playwright loads the events page (wait for networkidle), looks for event
 *   links (.views-row a, .event a, or similar), paginates through listing pages,
 *   then visits each detail page and extracts with Gemini from innerText.
 *
 * Run: node --env-file=.env ingest-oberlin-library.js
 */

import { chromium } from "playwright";
import crypto from "crypto";
import { fileURLToPath } from "url";

const SOURCE = {
  id: "oberlin_library",
  source_name: "Oberlin Public Library",
  adapter_key: "oberlin_library_v1",
  listing_url: "https://www.oberlinlibrary.org/events",
  default_location: "65 S. Main St., Oberlin, OH 44074",
  sponsors: ["Oberlin Public Library"],
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

// ─── Collect event URLs (paginated) ──────────────────────────────────────────

async function collectEventUrls(page) {
  const allHrefs = new Set();
  const BASE_URL = "https://www.oberlinlibrary.org";

  // Common Drupal / library CMS pagination patterns
  const paginationUrls = [
    SOURCE.listing_url,
    `${SOURCE.listing_url}?page=1`,
    `${SOURCE.listing_url}?page=2`,
    `${SOURCE.listing_url}?page=3`,
  ];

  for (const listUrl of paginationUrls) {
    console.log(`→ Listing page: ${listUrl}`);
    try {
      await page.goto(listUrl, { waitUntil: "networkidle", timeout: 60000 });
    } catch {
      await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    }
    await page.waitForTimeout(2000);

    const hrefs = await page.evaluate((baseUrl) => {
      // Try multiple selectors common in Drupal/library CMSs
      const selectors = [
        ".views-row a",
        ".event a",
        ".view-events a",
        ".views-field-title a",
        "h3.node-title a",
        "h2.node-title a",
        ".field-content a",
        "article a[href*='/events/']",
        "a[href*='/events/']",
        "a[href*='/event/']",
        ".program-title a",
        ".calendar-event a",
      ];

      const found = new Set();
      for (const sel of selectors) {
        try {
          document.querySelectorAll(sel).forEach(a => {
            const href = a.href || "";
            if (
              href &&
              (href.startsWith(baseUrl) || href.startsWith("/")) &&
              (href.includes("/events/") || href.includes("/event/")) &&
              !href.endsWith("/events") &&
              !href.endsWith("/events/") &&
              !href.includes("#") &&
              !href.includes("?page=") &&
              !href.includes("?month=")
            ) {
              found.add(a.href.startsWith("http") ? a.href : `${baseUrl}${a.href}`);
            }
          });
        } catch {}
      }
      return [...found];
    }, BASE_URL);

    const prevSize = allHrefs.size;
    hrefs.forEach(h => allHrefs.add(h));
    const added = allHrefs.size - prevSize;
    console.log(`   Found ${hrefs.length} links (${added} new, total: ${allHrefs.size})`);

    if (added === 0 && allHrefs.size > 0) break; // no more new results
  }

  // If we found no links with the path-based approach, try a broader approach
  if (allHrefs.size === 0) {
    console.log("   Falling back to broader link collection…");
    const hrefs = await page.evaluate((baseUrl) => {
      return [...document.querySelectorAll("a[href]")]
        .filter(a => {
          const href = a.href || "";
          return href.startsWith(baseUrl) &&
            href.length > baseUrl.length + 5 &&
            !href.includes("?") &&
            !href.includes("#");
        })
        .map(a => a.href)
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 50);
    }, BASE_URL);
    hrefs.forEach(h => allHrefs.add(h));
    console.log(`   Broad fallback found ${allHrefs.size} links`);
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
  console.log(`  Oberlin Public Library Ingester — ${SOURCE.adapter_key}`);
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
