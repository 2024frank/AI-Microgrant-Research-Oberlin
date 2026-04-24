/**
 * lib/duplicate-agent.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared duplicate-detection logic used by sync.js, sync-amam.js, and
 * sync-heritage-center.js.
 *
 * ALGORITHM (layered, fast → slow):
 *
 *   Layer 1 — Date window (⚡ cheapest)
 *     Require |date_A − date_B| ≤ 1 day. Using a window instead of exact
 *     equality protects against timezone-induced date shifts (e.g. an 8 PM
 *     Eastern event stored as UTC becomes the next calendar day on GitHub
 *     Actions' UTC clock).
 *
 *   Layer 2 — Title normalization + Jaccard similarity (⚡ cheap)
 *     Before comparing, strip status prefixes ("SOLD OUT - ", "CANCELLED - "
 *     etc.) and punctuation. Then compute Jaccard similarity on the set of
 *     meaningful words (length ≥ 4). Require ≥ TITLE_JACCARD_THRESHOLD (0.35)
 *     to proceed. This prevents "Senior Recital: A" from matching
 *     "Senior Recital: B" just because "senior" and "recital" overlap, while
 *     still catching "Concert X" matching "SOLD OUT - Concert X".
 *
 *   Layer 3 — Location guard (cheap)
 *     If both events have location strings, at least one location word (≥ 4
 *     chars) must overlap. Prevents two same-named events at completely
 *     different venues from being flagged.
 *
 *   Layer 4 — Gemini AI confirmation (🐢 slow, only called after layer 2+3)
 *     Gemini receives full title + date + location for both events and returns
 *     a structured JSON verdict. Only treat as duplicate when
 *     isDuplicate === true AND confidence ≥ MIN_GEMINI_CONFIDENCE (70).
 *
 *   Layer 5 — Within-queue guard (Firestore, called once per event)
 *     Before writing to review_queue, check Firestore for any pending event
 *     from the same source that normalizes to the same title slug. Prevents
 *     re-queuing on back-to-back sync runs before a reviewer acts.
 *
 * CONSTANTS (tune here, not in callers):
 *   TITLE_JACCARD_THRESHOLD   — minimum title similarity to be a candidate
 *   DATE_WINDOW_DAYS          — ±N days considered "same event"
 *   MIN_GEMINI_CONFIDENCE     — Gemini confidence % to mark as duplicate
 *
 * EXPORTS:
 *   normalizeTitle(title)               → string
 *   titleWordSet(title)                 → Set<string>
 *   jaccardSimilarity(setA, setB)       → number  0–1
 *   dateDiffDays(isoA, isoB)            → number  (absolute)
 *   mightBeDuplicate(incoming, chEvent) → { verdict: bool, reason: string }
 *   checkDuplicateInQueue(db, incoming, source_id) → Promise<bool>
 *   geminiCheckDuplicate(incoming, existing, apiKey) → Promise<{isDuplicate,confidence,reason}|null>
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Jaccard title-word similarity must exceed this to be a pre-filter candidate. */
export const TITLE_JACCARD_THRESHOLD = 0.35;

/** Two events are "same day" if they differ by at most this many calendar days. */
export const DATE_WINDOW_DAYS = 1;

/** Gemini confidence (0-100) required to treat a pair as a confirmed duplicate. */
export const MIN_GEMINI_CONFIDENCE = 70;

const GEMINI_MODEL = "gemini-2.5-flash";

// ─── Title normalization ──────────────────────────────────────────────────────

/**
 * Strip common status prefixes and normalize whitespace/case so that:
 *   "SOLD OUT - Concert X"  →  "concert x"
 *   "CANCELLED: Workshop Y" →  "workshop y"
 *   "[ONLINE] Lecture Z"    →  "lecture z"
 */
export function normalizeTitle(title) {
  if (!title) return "";
  return title
    // Strip leading status tags (bracket or prefix form)
    .replace(/^\[?(SOLD\s*OUT|CANCEL{1,2}ED?|POSTPONED|RESCHEDULED|ONLINE|VIRTUAL|HYBRID|MOVED)\]?\s*[-:–—\s]*/gi, "")
    // Strip trailing sold-out tags
    .replace(/\s*[-–—]\s*(SOLD\s*OUT|CANCEL{1,2}ED?)\s*$/gi, "")
    // Remove punctuation except hyphens inside words
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/**
 * Return the Set of meaningful words (length ≥ 4) from a normalized title.
 * Short words ("the", "and", "with", etc.) are excluded as they add noise.
 */
export function titleWordSet(title) {
  return new Set(
    normalizeTitle(title)
      .split(/\s+/)
      .filter(w => w.length >= 4)
  );
}

// ─── Similarity ───────────────────────────────────────────────────────────────

/**
 * Jaccard similarity: |A ∩ B| / |A ∪ B|
 * Returns 0–1. Returns 0 if both sets are empty.
 */
export function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = [...setA].filter(w => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Absolute difference in calendar days between two ISO date strings or
 * "YYYY-MM-DD" strings. Returns Infinity if either is missing.
 */
export function dateDiffDays(isoA, isoB) {
  if (!isoA || !isoB) return Infinity;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.abs(new Date(isoA).getTime() - new Date(isoB).getTime()) / msPerDay;
}

// ─── Layer 1-3: Pre-filter ────────────────────────────────────────────────────

/**
 * Cheap CPU-only pre-filter. Returns { verdict: bool, reason: string }.
 * Only events that pass get sent to Gemini.
 *
 * @param incoming  { title, date, location }  — event being evaluated
 * @param chEvent   { title, date, location }  — event from CommunityHub
 */
export function mightBeDuplicate(incoming, chEvent) {
  // Layer 1: date window
  const dayDiff = dateDiffDays(incoming.date, chEvent.date);
  if (dayDiff > DATE_WINDOW_DAYS) {
    return { verdict: false, reason: `date gap ${dayDiff.toFixed(1)} days > window ${DATE_WINDOW_DAYS}` };
  }

  // Layer 2: Jaccard title similarity
  const inWords = titleWordSet(incoming.title);
  const chWords = titleWordSet(chEvent.title);
  const jaccard  = jaccardSimilarity(inWords, chWords);

  if (jaccard < TITLE_JACCARD_THRESHOLD) {
    return {
      verdict: false,
      reason: `title Jaccard ${jaccard.toFixed(2)} < threshold ${TITLE_JACCARD_THRESHOLD} ` +
              `("${normalizeTitle(incoming.title)}" vs "${normalizeTitle(chEvent.title)}")`,
    };
  }

  // Layer 3: location guard — if both have locations, at least one word must overlap
  const locA = (incoming.location || "").toLowerCase();
  const locB  = (chEvent.location  || "").toLowerCase();
  if (locA && locB) {
    const locWordsA = new Set(locA.split(/\W+/).filter(w => w.length >= 4));
    const locWordsB = locB.split(/\W+/).filter(w => w.length >= 4);
    const locOverlap = locWordsB.some(w => locWordsA.has(w));
    if (!locOverlap) {
      return {
        verdict: false,
        reason: `location mismatch ("${locA}" vs "${locB}") despite title Jaccard ${jaccard.toFixed(2)}`,
      };
    }
  }

  return {
    verdict: true,
    reason: `title Jaccard ${jaccard.toFixed(2)}, date gap ${dayDiff.toFixed(1)}d — sending to Gemini`,
  };
}

// ─── Layer 4: Gemini AI confirmation ─────────────────────────────────────────

/**
 * Ask Gemini whether two events are the same real-world occurrence.
 * Returns { isDuplicate, confidence, reason } or null on error.
 *
 * Only called AFTER mightBeDuplicate returns { verdict: true }.
 */
export async function geminiCheckDuplicate(incoming, existing, apiKey) {
  if (!apiKey) return null;
  try {
    const prompt = `You are a duplicate-detection agent for a community calendar.

Determine if these two events are the SAME real-world occurrence (possibly
listed from different sources or with slightly different wording).

Incoming event (about to be posted):
  Title    : ${incoming.title}
  Date     : ${incoming.date}
  Location : ${incoming.location || "unknown"}
  Desc     : ${(incoming.description || "").slice(0, 300)}

Existing event (already on the calendar):
  Title    : ${existing.title}
  Date     : ${existing.date}
  Location : ${existing.location || "unknown"}

Rules:
- Two different performances of the same show on DIFFERENT dates are NOT duplicates.
- Minor wording differences ("cello recital" vs "recital for cello") count as the same.
- A "SOLD OUT" prefix does not change identity.

Reply with JSON only — no markdown, no explanation outside the JSON:
{"isDuplicate": true, "confidence": 0-100, "reason": "one sentence"}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";
    return JSON.parse(raw.replace(/```json\n?|```/g, "").trim());
  } catch (err) {
    console.warn(`  Duplicate Agent (Gemini) error: ${err.message}`);
    return null;
  }
}

// ─── Layer 5: Within-queue guard ─────────────────────────────────────────────

/**
 * Check Firestore review_queue for a pending event from the same source that
 * has the same normalized title slug and a date within DATE_WINDOW_DAYS.
 *
 * Prevents re-queuing events on back-to-back sync runs before a reviewer acts.
 *
 * Returns true if a match is found (= already queued, skip this one).
 */
export async function checkDuplicateInQueue(db, incoming, source_id) {
  if (!db) return false;
  try {
    const snap = await db.collection("review_queue")
      .where("status", "==", "pending")
      .where("source_id", "==", source_id)
      .select("original")
      .get();

    const slug = normalizeTitle(incoming.title);

    for (const d of snap.docs) {
      const existing = d.data().original || {};
      const existingSlug = normalizeTitle(existing.title || "");
      const dayDiff = dateDiffDays(incoming.date, (existing.date || "").slice(0, 10));

      if (dayDiff <= DATE_WINDOW_DAYS) {
        const inWords = new Set(slug.split(/\s+/).filter(w => w.length >= 4));
        const exWords = new Set(existingSlug.split(/\s+/).filter(w => w.length >= 4));
        const jaccard  = jaccardSimilarity(inWords, exWords);
        if (jaccard >= TITLE_JACCARD_THRESHOLD) {
          console.log(`  ↩ Already in queue: "${incoming.title}" ≈ "${existing.title}" (Jaccard ${jaccard.toFixed(2)}, Δ${dayDiff.toFixed(1)}d)`);
          return true;
        }
      }
    }
    return false;
  } catch (err) {
    console.warn(`  Queue guard error: ${err.message}`);
    return false;
  }
}

// ─── Run-level dedup helper ───────────────────────────────────────────────────

/**
 * Factory: returns a function that tracks events seen within the current run.
 * Call seenThisRun(incoming) — returns true if we already processed a very
 * similar event earlier in THIS run (catches multi-date showings of the same
 * event that Localist emits as separate records with the same title but
 * different dates — we still let those through; this only blocks exact same
 * title + same date).
 */
export function makeRunDeduplicator() {
  const seen = new Map(); // slug+date → title
  return function seenThisRun(incoming) {
    const key = `${normalizeTitle(incoming.title)}|${incoming.date}`;
    if (seen.has(key)) {
      console.log(`  ↩ Already processed this run: "${incoming.title}" on ${incoming.date}`);
      return true;
    }
    seen.set(key, incoming.title);
    return false;
  };
}
