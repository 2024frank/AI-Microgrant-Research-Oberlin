# Future Implementation Plan

This document describes the planned next phases of the Oberlin Community Calendar Unification project. Phase 1 (Localist sync) is complete and running. Everything below is planned work.

---

## Phase 2 — Additional Calendar Sources

Right now the pipeline only pulls from Oberlin College's Localist calendar. The goal is to expand to every major Oberlin community organization.

### Target Sources

| Organization | Likely Feed Format |
|---|---|
| FAVA (Fine Arts) | Website / iCal |
| AMAM (Allen Memorial Art Museum) | Website / iCal |
| City of Oberlin | Website / iCal or RSS |
| Local businesses and venues | Various |
| Oberlin Public Library | Website |
| Student organizations (non-Localist) | Manual or scraped |

### Implementation Approach

Each source gets its own sync module that:
1. Fetches events from the source (API, iCal, RSS, or web scrape)
2. Normalizes the event data into a shared internal format
3. Passes the normalized event to a shared `pushToCommunityHub()` function

The shared format will include: `title`, `description`, `startTime`, `endTime`, `location`, `contactEmail`, `eventUrl`, `imageUrl`, `sourceId`, `sourceName`.

Deduplication across sources (e.g., an AMAM event that also appears on Localist) is handled by Phase 3.

### iCal Sources

For organizations that publish `.ics` files, we will use the `node-ical` package to parse the feed. Each event's `UID` from the iCal spec serves as the stable source ID for deduplication within that source.

### Scraped Sources

For organizations without a machine-readable feed, we will write a lightweight scraper using `cheerio`. These require more maintenance and will be prioritized last.

---

## Phase 3 — AI Deduplication

When two different source calendars list the same real-world event, we should post it to CommunityHub only once. This is the AI component of the project.

### The Problem

A concert at Finney Chapel might appear on:
- Oberlin College's Localist calendar (posted by the music department)
- FAVA's calendar (posted by the presenting organization)

The titles and descriptions will probably be different. We cannot match them with simple string comparison.

### Approach: Start Time as Anchor, LLM as Judge

Start time is the most reliable field. Two events with the same start time and overlapping details are very likely the same event.

Algorithm:

```
For each new event being pushed:
  1. Query CommunityHub for all pending/approved events on the same day
  2. Filter to events within 30 minutes of the same start time
  3. If any candidates exist:
       a. Build a prompt containing both events' title, description, location, and organizer
       b. Ask the LLM: "Are these the same real-world event? Answer YES or NO."
       c. If YES: skip this push (duplicate detected)
       d. If NO: push as a new event
  4. If no candidates: push as a new event
```

### LLM Choice

We plan to use **Google Gemini** (via the Gemini API) because:
- Oberlin has a relationship with Google through the grant program
- API tokens are being requested through the grant
- Gemini Flash is fast and inexpensive for short comparison prompts

Fallback: if no API key is available, the system will push and flag potential duplicates in the console log for manual review.

### Implementation Notes

- The LLM call adds ~1-2 seconds per potential duplicate check. For most events there will be no candidates, so the call is skipped entirely.
- We cache the CommunityHub event list at the start of each sync run to avoid repeated API calls.
- False positives (blocking a legitimate new event) are worse than false negatives (allowing a duplicate). The LLM prompt will be tuned to prefer "NO" when uncertain.
- Human moderator (Maddy) provides a final safety net since all pushed events are pending before approval.

### Prompt Template (Draft)

```
You are helping deduplicate community event listings.

Event A (already posted):
Title: {titleA}
Start: {startA}
Location: {locationA}
Description: {descriptionA}

Event B (candidate to post):
Title: {titleB}
Start: {startB}
Location: {locationB}
Description: {descriptionB}

Are Event A and Event B the same real-world event?
Answer only YES or NO.
```

---

## Phase 4 — Edit and Delete Support

The current pipeline can only create events. CommunityHub does not yet expose edit or delete endpoints. When those become available, the pipeline will:

### Edit
- On each sync run, compare the current Localist event data against what was previously pushed
- If the title, description, time, or location changed: call the edit endpoint
- Store a hash of the last-pushed payload alongside the event ID in `pushed_ids.json` to detect changes without re-calling CommunityHub

### Delete
- When a Localist event is cancelled or set to private: call the delete endpoint
- When a duplicate is confirmed by the AI deduplication check for an already-pushed event: call the delete endpoint to remove it

### pushed_ids.json Schema Change (Phase 4)

Currently `pushed_ids.json` is a flat array of ID strings. Phase 4 requires storing more metadata:

```json
{
  "12345": {
    "pushedAt": 1714000000,
    "communityHubId": "abc-def-ghi",
    "payloadHash": "sha256:..."
  }
}
```

This is a breaking change to the file format and will require a one-time migration.

---

## Phase 5 — Monitoring and Alerting

Once multiple sources are running, we need visibility into failures.

Planned:
- Daily summary email (or Slack message) showing events pushed, skipped, failed, and duplicates detected
- Alert when a source feed is unreachable for more than 6 hours
- Dashboard (simple HTML page hosted via GitHub Pages) showing sync status per source

---

## Dependency Tracker

| Feature | Blocked On |
|---|---|
| AI deduplication | Gemini API key (requested via grant) |
| Edit pushed events | CommunityHub edit endpoint (Hitesh) |
| Delete pushed events | CommunityHub delete endpoint (Hitesh) |
| Duplicate cleanup (current) | CommunityHub delete endpoint (Hitesh) |
| FAVA / AMAM sources | Confirming their feed URLs / formats |
