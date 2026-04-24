# Localist → CommunityHub Sync

Automatically syncs public events from Oberlin's Localist calendar to CommunityHub, running hourly via GitHub Actions.

---

## How It Works

1. Fetches all live, public, future events from the Localist API
2. Checks `pushed_ids.json` to skip already-synced events
3. Transforms each event into the CommunityHub payload format
4. POSTs new events to CommunityHub (they appear as **unapproved/pending**)
5. Saves the event IDs back to `pushed_ids.json` to prevent duplicates

---

## Field Mapping

| CommunityHub Field | Source |
|---|---|
| `title` | `event.title` (max 60 chars) |
| `description` | `event.description_text` (max 200 chars) |
| `extendedDescription` | `event.description_text` (max 1000 chars) |
| `email` / `contactEmail` | `event.custom_fields.contact_email_address` |
| `phone` | `event.custom_fields.contact_phone_number` |
| `website` | `event.localist_url` |
| `sponsors` | `event.filters.departments[].name` |
| `postTypeId` | mapped from `event.filters.event_types[].name` |
| `sessions.startTime` | `event.event_instances[0].start` (unix) |
| `sessions.endTime` | `event.event_instances[0].end` (unix) |
| `locationType` | `event.experience` → `ph2` / `on` / `bo` |
| `location` | `event.address` or `event.location_name` |
| `urlLink` | `event.stream_url` (if virtual) |
| `display` | hardcoded `"all"` (all public screens) |

---

## Event Type Mapping

| Localist Type | CommunityHub `postTypeId` |
|---|---|
| Lecture / Talk / Presentation | `6` |
| Music / Concert | `8` |
| Theatre / Dance / Performance | `9` |
| Workshop / Class | `7` |
| Exhibit / Exhibition | `2` |
| Festival / Fair / Celebration | `3` |
| Tour / Open House | `4` |
| Sport / Recreation / Game | `12` |
| Networking | `13` |
| Anything else | `89` (Other) |

---

## Setup

### GitHub Secret Required

| Secret | Value |
|---|---|
| `FALLBACK_EMAIL` | Email used when an event has no contact email |

Add it at: `Settings → Secrets and variables → Actions → New repository secret`

### Schedule

Runs every hour automatically. To trigger manually:
`Actions → Localist → CommunityHub Sync → Run workflow`

---

## APIs Used

- **Localist (source):** `https://calendar.oberlin.edu/api/2/events`
- **CommunityHub (destination):** `https://oberlin.communityhub.cloud/api/legacy/calendar/posts`

---

## Files

| File | Purpose |
|---|---|
| `sync.js` | Main sync script |
| `pushed_ids.json` | Tracks already-pushed Localist event IDs |
| `.github/workflows/sync.yml` | GitHub Actions workflow |
