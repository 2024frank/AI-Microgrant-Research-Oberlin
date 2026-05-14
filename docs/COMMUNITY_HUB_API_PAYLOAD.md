# Community Hub — API payload reference

This document describes the payload structure for creating **Events**, **Announcements**, and **Jobs** on Oberlin Community Hub. It is the source of truth for **Gemini extraction** prompts in this repo (`src/lib/gemini.ts`). It is **not** loaded into the Anthropic Source Builder agent.

## Endpoints

**Create**

`POST https://oberlin.communityhub.cloud/api/legacy/calendar/post/submit`

**Edit (full submit body)**

`POST https://oberlin.communityhub.cloud/api/legacy/calendar/post/{id}/submit`

**Partial update (if supported)**

`PATCH https://oberlin.communityhub.cloud/api/legacy/calendar/post/{id}/submit`

Example PATCH body:

```json
{
  "image_cdn_url": "https://localist-images.azureedge.net/photos/749835/card/167cb5321f65b3a32551648b7901df0a2ac5877d.jpg"
}
```

## Post kinds (`eventType`)

| `eventType` | Description |
| --- | --- |
| `ot` | Event |
| `an` | Announcement |
| `jp` | Job |

This pipeline currently emits **`ot`** and **`an`** only; jobs (`jp`) are documented for future use.

## `postTypeId` — official IDs

Use **only** these integers in `postTypeId` arrays (see `COMMUNITY_HUB_POST_TYPES` in `src/lib/postTypes.ts`):

| ID | Name |
| --- | --- |
| 1 | Volunteer Opportunity |
| 2 | Exhibit |
| 3 | Fair, Festival, or Public Celebration |
| 4 | Tour, Walking Tours or Open House |
| 5 | Film |
| 6 | Presentation or Lecture |
| 7 | Workshop or Class |
| 8 | Music Performance |
| 9 | Theatre or Dance |
| 10 | City Government |
| 11 | Spectator Sport |
| 12 | Participatory Sport or Game |
| 13 | Networking Event |
| 59 | Ecolympics or Environmental |
| 89 | Other |

## Location types

| `locationType` | Meaning | `location` | `urlLink` |
| --- | --- | --- | --- |
| `ph2` | Physical only | Required | Omit |
| `on` | Online only | Omit | Required |
| `bo` | Hybrid | Required | Required |
| `ne` | Neither | Omit | Omit |

## Display

| `display` | Meaning | `screensIds` |
| --- | --- | --- |
| `all` | All public screens | Empty `[]` OK |
| `ps` | School screens only | Empty OK |
| `sps` | School + public | Empty OK |
| `ss` | Specific screens | Required, min 1 |

## Required fields (typical submit)

| Field | Notes |
| --- | --- |
| `eventType` | `ot`, `an`, or `jp` |
| `email` | Valid email |
| `title` | Short title |
| `description` | Short body (Hub may enforce length bounds) |
| `sponsors` | Min 1 entry |
| `postTypeId` | Min 1 entry from table above |
| `sessions` | `startTime` / `endTime` as **Unix seconds** |
| `display` | One of `all`, `ps`, `sps`, `ss` |

## Conditional fields

- `location` — required when `locationType` is `ph2` or `bo`.
- `urlLink` — required when `locationType` is `on` or `bo`.
- `screensIds` — required when `display` is `ss`.

## Optional fields

Includes `phone`, `website`, `contactEmail`, `extendedDescription`, `buttons` (`title` + `link`), `roomNum`, `calendarSourceName`, `calendarSourceUrl`, `placeId`, `placeName`, `image_cdn_url` (third-party image URL), `subscribe`, `public` (often `"1"`).

## Sample payloads (valid JSON)

Examples below omit inline `//` comments so they remain valid JSON.

### Event — physical only (`ph2`)

```json
{
  "eventType": "ot",
  "email": "organizer@example.com",
  "subscribe": true,
  "contactEmail": "contact@example.com",
  "phone": "+1 (555) 123-4567",
  "website": "https://www.example.com",
  "title": "Community Art Workshop",
  "sponsors": ["Local Arts Council", "City Parks Department"],
  "postTypeId": [1, 3],
  "sessions": [
    { "startTime": 1714492800, "endTime": 1714500000 }
  ],
  "description": "Join us for a hands-on community art workshop where participants will create beautiful murals together.",
  "extendedDescription": "This workshop will provide all materials and is suitable for all ages and skill levels.",
  "locationType": "ph2",
  "location": "123 Main Street, Cleveland, OH 44115",
  "placeId": "ChIJeRpOeF64woAR9RJHkHn_VWI",
  "placeName": "Cleveland Community Center",
  "roomNum": "Room 101",
  "image_cdn_url": "https://localist-images.azureedge.net/photos/749835/card/167cb5321f65b3a32551648b7901df0a2ac5877d.jpg",
  "buttons": [{ "title": "Register Now", "link": "https://www.example.com/register" }],
  "display": "all",
  "screensIds": [],
  "calendarSourceName": "Oberlin College",
  "calendarSourceUrl": "https://www.oberlin.edu/registrar/academic-calendar",
  "public": "1"
}
```

### Event — online only (`on`)

```json
{
  "eventType": "ot",
  "email": "events@university.edu",
  "subscribe": true,
  "contactEmail": "events@university.edu",
  "phone": "+1 (440) 775-8000",
  "website": "https://www.oberlin.edu/events",
  "title": "Climate Change Symposium",
  "sponsors": ["Oberlin College", "Environmental Research Institute"],
  "postTypeId": [6, 13],
  "sessions": [
    { "startTime": 1714665600, "endTime": 1714686000 }
  ],
  "description": "A comprehensive symposium on climate change solutions featuring renowned scientists and policy experts.",
  "extendedDescription": "This full-day symposium includes keynote presentations, panel discussions, and networking opportunities.",
  "locationType": "on",
  "urlLink": "https://university.zoom.us/j/123456789",
  "buttons": [{ "title": "Join Online", "link": "https://university.zoom.us/j/123456789" }],
  "display": "sps",
  "screensIds": [],
  "public": "1"
}
```

### Event — hybrid (`bo`)

```json
{
  "eventType": "ot",
  "email": "events@university.edu",
  "subscribe": true,
  "contactEmail": "events@university.edu",
  "phone": "+1 (440) 775-8000",
  "website": "https://www.oberlin.edu/events",
  "title": "Climate Change Symposium",
  "sponsors": ["Oberlin College", "Environmental Research Institute"],
  "postTypeId": [6, 4],
  "sessions": [
    { "startTime": 1714665600, "endTime": 1714686000 }
  ],
  "description": "A comprehensive symposium on climate change solutions featuring renowned scientists and policy experts.",
  "extendedDescription": "This full-day symposium includes keynote presentations, panel discussions, and networking opportunities.",
  "locationType": "bo",
  "location": "150 W Lorain St, Oberlin, OH 44074",
  "placeId": "ChIJBVIKF8HGNogRZSLw1K3nB6g",
  "placeName": "Oberlin College - Finney Chapel",
  "roomNum": "Main Auditorium",
  "urlLink": "https://oberlin.zoom.us/j/987654321",
  "buttons": [
    { "title": "Register In-Person", "link": "https://events.oberlin.edu/register-in-person" },
    { "title": "Join Online", "link": "https://oberlin.zoom.us/j/987654321" }
  ],
  "display": "sps",
  "screensIds": [],
  "public": "1"
}
```

### Announcement — no venue (`ne`)

```json
{
  "eventType": "an",
  "email": "communications@city.gov",
  "subscribe": true,
  "contactEmail": "info@city.gov",
  "phone": "+1 (216) 664-2000",
  "website": "https://www.clevelandohio.gov",
  "title": "New Community Health Program Launch",
  "sponsors": ["Cleveland Department of Health", "United Way"],
  "postTypeId": [5],
  "sessions": [
    { "startTime": 1714752000, "endTime": 1714752000 }
  ],
  "description": "The City of Cleveland is excited to announce the launch of our new comprehensive community health program.",
  "extendedDescription": "This program offers free health screenings, wellness workshops, and nutritional counseling to all Cleveland residents.",
  "locationType": "ne",
  "location": "",
  "buttons": [
    { "title": "Learn More", "link": "https://clevelandohio.gov/health-program" },
    { "title": "Find Locations", "link": "https://clevelandohio.gov/locations" }
  ],
  "display": "all",
  "screensIds": [],
  "public": "1"
}
```

For announcements, `startTime` and `endTime` are typically the same instant.

## Images from a URL

Use `image_cdn_url` with the full HTTPS URL of the hosted image when not uploading a file through another flow.
