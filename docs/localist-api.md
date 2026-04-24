# Oberlin Localist API

**Base URL:** `https://calendar.oberlin.edu/api/2`

---

## Fetching Events

```
GET /events?days=365&pp=100&page=1
```

| Parameter | Description |
|-----------|-------------|
| `days` | How many days ahead to fetch (365 = full year) |
| `pp` | Events per page (max 100) |
| `page` | Page number (start at 1) |

**Pagination:**
```js
const total = payload.page?.total;           // total event count
const totalPages = Math.ceil(total / pp);    // how many pages
// request page=2, page=3, … up to totalPages
```

Each item in `payload.events` is a wrapper — the actual event is at `row.event`.

**Filter for valid events:**
```js
if (!e || e.status !== "live" || e.private) continue;
```

---

## Event Object — All Fields

### Core Identity
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique event ID |
| `title` | string | Event title |
| `urlname` | string | URL slug |
| `status` | string | `"live"` or other — filter for `"live"` only |
| `kind` | string | `"standalone"` or `"recurring"` |
| `recurring` | bool | Whether it repeats |
| `private` | bool | Skip if `true` |

### Dates & Times
| Field | Path | Description |
|-------|------|-------------|
| `start` | `event_instances[0].event_instance.start` | ISO 8601 datetime |
| `end` | `event_instances[0].event_instance.end` | ISO 8601 datetime |
| `all_day` | `event_instances[0].event_instance.all_day` | Boolean |
| `num_attending` | `event_instances[0].event_instance.num_attending` | Attendance count |
| `first_date` | `event.first_date` | First occurrence date |
| `last_date` | `event.last_date` | Last occurrence date |

### Location
| Field | Type | Description |
|-------|------|-------------|
| `location` | string | Free-text location |
| `location_name` | string | Named venue |
| `room_number` | string | Room within venue |
| `address` | string | Street address |
| `geo.latitude` | number | Latitude |
| `geo.longitude` | number | Longitude |
| `geo.street` | string | Street |
| `geo.city` | string | City |
| `geo.state` | string | State |
| `geo.country` | string | Country |
| `geo.zip` | string | ZIP code |
| `venue_id` | number | Localist venue ID |
| `venue_url` | string | Localist venue page |

**Location priority in sync:**
```js
const location = e.address || e.location_name || e.location || "Oberlin, OH";
```

### Content
| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Full HTML description |
| `description_text` | string | Plain text version (use this) |
| `photo_url` | string | Event image URL |
| `photo_id` | number | Localist photo ID |
| `ticket_url` | string | Registration / ticket link |
| `ticket_cost` | string | Cost string (e.g. "Free", "$10") |

**Description usage in sync:**
```js
const raw = (e.description_text || e.description || "")
  .replace(/<[^>]*>/g, " ").trim();
```

### Streaming / Virtual
| Field | Type | Description |
|-------|------|-------------|
| `experience` | string | `"inperson"`, `"virtual"`, or `"hybrid"` |
| `stream_url` | string | Live stream link |
| `stream_info` | string | Stream instructions |
| `stream_embed_code` | string | Embeddable player HTML |

**Mapped to CommunityHub `locationType`:**
```js
"virtual"  → "on"   // online only
"hybrid"   → "bo"   // both
"inperson" → "ph2"  // physical
```

### Categorization
| Field | Type | Description |
|-------|------|-------------|
| `filters.departments` | `[{ name, id }]` | Sponsoring departments |
| `filters.event_types` | `[{ name, id }]` | Event type tags |
| `filters.event_public_events` | array | Audience labels |
| `keywords` | string[] | Keyword tags |
| `tags` | string[] | General tags |

**Used in sync for sponsors:**
```js
const sponsors = (e.filters?.departments || []).map(d => d.name);
if (sponsors.length === 0) sponsors.push("Oberlin College");
```

### Contact Info (`custom_fields`)
| Field | Description |
|-------|-------------|
| `custom_fields.contact_person` | Contact name |
| `custom_fields.contact_phone_number` | Phone number |
| `custom_fields.contact_email_address` | Email address |

### Flags
| Field | Type | Description |
|-------|------|-------------|
| `free` | bool | Free admission |
| `verified` | bool | Verified by admin |
| `featured` | bool | Featured event |
| `sponsored` | bool | Sponsored content |

### URLs
| Field | Description |
|-------|-------------|
| `localist_url` | Canonical event page on Localist |
| `localist_ics_url` | iCal download link |

**Event URL priority:**
```js
const url = e.localist_url
  || e.url
  || (e.urlname ? `https://calendar.oberlin.edu/event/${e.urlname}` : null);
```

---

## Complete Fetch Function

```js
const API = "https://calendar.oberlin.edu/api/2/events";

async function fetchLocalist(days = 365, pp = 100, maxPages = 10) {
  let page = 1, totalPages = 1;
  const events = [];

  while (page <= totalPages && page <= maxPages) {
    const url = new URL(API);
    url.searchParams.set("days", String(days));
    url.searchParams.set("pp", String(pp));
    url.searchParams.set("page", String(page));

    const res = await fetch(url, { headers: { "User-Agent": "localist-sync-bot/1.0" } });
    if (!res.ok) throw new Error(`Localist HTTP ${res.status}`);

    const payload = await res.json();
    const total = Number(payload.page?.total || 0);
    totalPages = Math.max(1, Math.ceil(total / pp));

    for (const wrapped of payload.events || []) {
      const e = wrapped.event;
      if (!e || e.status !== "live" || e.private) continue;
      events.push(e);
    }
    page++;
  }
  return events;
}
```

---

## Field Mapping — Localist → CommunityHub

| CommunityHub field | Source |
|-------------------|--------|
| `title` | `e.title` (capped at 60 chars) |
| `description` | Gemini-cleaned `description_text` (≤200 chars) |
| `extendedDescription` | Gemini-cleaned `description_text` (≤1000 chars) |
| `sessions[].startTime` | `event_instances[0].event_instance.start` → Unix |
| `sessions[].endTime` | `event_instances[0].event_instance.end` → Unix |
| `location` | `address \|\| location_name \|\| location` |
| `locationType` | Mapped from `experience` |
| `urlLink` | `stream_url` (virtual events) |
| `website` | `localist_url` |
| `sponsors` | `filters.departments[].name` |
| `postTypeId` | Mapped from `filters.event_types[].name` |
| `contactEmail` | `custom_fields.contact_email_address` |
| `phone` | `custom_fields.contact_phone_number` |
| `_photoUrl` | `photo_url` (fetched at push time) |

---

## Post Type ID Mapping

| Keyword | ID |
|---------|----|
| lecture, talk, presentation, seminar, symposium, conference | 6 |
| music, concert | 8 |
| performance, theatre, theater, dance | 9 |
| workshop, class | 7 |
| exhibit, exhibition, gallery | 2 |
| festival, fair, celebration | 3 |
| tour, open house | 4 |
| sport, game, recreation | 12 |
| networking | 13 |
| (default / unmatched) | 89 |

---

## Notes

- The sync skips events already in `pushed_ids.json` or Firestore (`review_queue` / `rejected`)
- All events go through 3 AI agents before reaching the review queue:
  1. **Duplicate Agent** — checks against existing CommunityHub events
  2. **Writer Agent** — cleans description (removes URLs, summarizes)
  3. **Public Agent** — filters internal/private Oberlin College events
- Photos are not stored in Firestore — `_photoUrl` is fetched fresh at push time via `/api/push-event`
