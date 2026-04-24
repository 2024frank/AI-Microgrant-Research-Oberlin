# Oberlin Community Calendar Unification

An AI-assisted project to bring all Oberlin community events into one place.

---

## The Problem

Event information in Oberlin is scattered. Oberlin College, FAVA, AMAM, the City of Oberlin, local businesses, and student organizations each manage their own calendar on their own platform. There is no single place where students, faculty, staff, and Oberlin residents can see everything happening in the community.

---

## The Goal

Build a system that automatically pulls events from every major Oberlin community source and unifies them on [CommunityHub](https://oberlin.communityhub.cloud) — one community calendar for everyone. The system uses AI to detect and avoid posting the same event twice when it appears on multiple source calendars.

---

## Who Is Involved

| Person | Role |
|---|---|
| Frank Kusi Appiah | Developer, project lead (Oberlin College, Class of 2027) |
| Prof. John Petersen | Faculty advisor |
| Hitesh | CommunityHub platform and API support |
| Maddy | CommunityHub event moderator |

---

## What We Have Done So Far

### Localist to CommunityHub Sync

The first working pipeline automatically syncs all live, public events from Oberlin College's Localist calendar to CommunityHub.

It runs every hour via GitHub Actions and:
1. Fetches all upcoming live public events from `calendar.oberlin.edu`
2. Checks which ones have already been posted to avoid duplicates
3. Transforms each event into the CommunityHub format, including title, description, start and end times, location, contact info, event category, and image
4. Posts new events to CommunityHub, where they appear as pending for Maddy to review and approve
5. Saves the event ID so the same event is never posted twice

We have successfully pushed 93+ Oberlin College events to CommunityHub, with images. The pipeline handles edge cases like missing end times, missing contact info, virtual vs in-person vs hybrid events, and event category mapping.

---

## What Is Next

More to come — check back soon.

---

## Technical Reference

### Field Mapping

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
| `locationType` | `event.experience` mapped to `ph2` / `on` / `bo` |
| `location` | `event.address` or `event.location_name` |
| `urlLink` | `event.stream_url` (if virtual or hybrid) |
| `image` | `event.photo_url` fetched and sent as base64 data URI |

### Event Type Mapping

| Localist Type | CommunityHub `postTypeId` |
|---|---|
| Lecture / Talk / Presentation / Seminar | `6` |
| Music / Concert | `8` |
| Theatre / Dance / Performance | `9` |
| Workshop / Class | `7` |
| Exhibit / Exhibition / Gallery | `2` |
| Festival / Fair / Celebration | `3` |
| Tour / Open House | `4` |
| Sport / Recreation / Game | `12` |
| Networking | `13` |
| Anything else | `89` (Other) |

### Setup

**GitHub Secret required:**

| Secret | Value |
|---|---|
| `FALLBACK_EMAIL` | Email used when an event has no contact email |

Add it at: `Settings > Secrets and variables > Actions > New repository secret`

The sync runs every hour automatically. To trigger it manually: `Actions > Localist > CommunityHub Sync > Run workflow`

### Files

| File | Purpose |
|---|---|
| `sync.js` | Localist to CommunityHub sync script |
| `pushed_ids.json` | Tracks already-posted Localist event IDs |
| `FUTURE_IMPLEMENTATION.md` | Detailed technical roadmap |
| `.github/workflows/sync.yml` | GitHub Actions hourly schedule |
