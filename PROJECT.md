# AI Micro-Grant Research — Oberlin Community Calendar Unification

**Project Lead:** Frank Kusi Appiah (Oberlin College, Class of 2027)  
**Faculty Advisor:** Professor John Petersen  
**Institution:** Oberlin College  
**Platform:** [oberlin.communityhub.cloud](https://oberlin.communityhub.cloud)

---

## The Problem

Oberlin's event information is scattered across many places: the college calendar, FAVA, AMAM, the City of Oberlin, local businesses, and more. Each organization maintains its own calendar on its own platform. Community members have no single place to discover what is happening, and event organizers have no easy way to reach the broader Oberlin community without manually posting to multiple places.

---

## The Goal

Build an AI-assisted pipeline that automatically pulls events from every major Oberlin community source and unifies them on CommunityHub — a single community calendar that students, faculty, staff, and Oberlin residents can actually use.

The system should:
- Run automatically without human intervention
- Avoid posting the same event twice, even when the same event appears on multiple source calendars
- Handle varying levels of event detail gracefully
- Require no changes to how organizations currently manage their own calendars

---

## What We Have Built So Far

### Localist to CommunityHub Sync

The first working pipeline fetches all live, public, future events from Oberlin College's Localist calendar (`calendar.oberlin.edu`) and posts them to CommunityHub.

**Status: Working.** As of April 2026 we have successfully pushed 93+ events from Localist to CommunityHub, including event images.

How it works:
1. Fetches all live public events from the Localist API (paginated, up to 365 days ahead)
2. Checks `pushed_ids.json` to skip events already posted
3. Transforms each Localist event into the CommunityHub payload format (title, description, start/end times, location, contact info, event type, image)
4. POSTs to the CommunityHub API — events appear as pending and go to a human moderator (Maddy) for approval
5. Saves the event ID so it is never pushed twice
6. Runs every hour via GitHub Actions

### What the Sync Handles

| Detail | How We Handle It |
|---|---|
| Missing contact email | Falls back to a configured default |
| Missing phone number | Sends empty string (API requires the field) |
| Missing end time | Defaults to 1 hour after start |
| In-person vs virtual vs hybrid | Maps to CommunityHub location types |
| Event type (lecture, concert, etc.) | Maps Localist category names to CommunityHub post type IDs |
| Event images | Downloads the image and sends it as a base64 data URI |
| Deduplication | Tracks pushed IDs in a JSON file committed back to the repo |

---

## Roadmap

See [FUTURE_IMPLEMENTATION.md](FUTURE_IMPLEMENTATION.md) for the full technical plan. High-level phases:

### Phase 2 — Additional Calendar Sources
Add sync pipelines for FAVA, AMAM, the City of Oberlin, and other community organizations that publish public event feeds (iCal, RSS, or web scraping where needed).

### Phase 3 — AI Deduplication
When the same event appears in two or more source calendars, the system should detect it and post only once rather than creating duplicates on CommunityHub. This requires an LLM to compare event details because titles and descriptions are rarely identical across platforms.

### Phase 4 — Edit and Delete Support
Right now the pipeline can only create new events. Once the CommunityHub API exposes edit and delete endpoints, the pipeline will keep posted events up to date when source events change, and remove them when they are cancelled.

---

## People

| Person | Role |
|---|---|
| Frank Kusi Appiah | Developer, project lead |
| Prof. John Petersen | Faculty advisor |
| Hitesh (CommunityHub) | API support, CommunityHub platform |
| Maddy | CommunityHub event moderator / approver |

---

## Repository Structure

| File | Purpose |
|---|---|
| `sync.js` | Main Localist to CommunityHub sync script |
| `pushed_ids.json` | Tracks Localist event IDs already posted to CommunityHub |
| `PROJECT.md` | This file — project overview and goals |
| `FUTURE_IMPLEMENTATION.md` | Detailed technical roadmap |
| `README.md` | Quick-start guide for the sync script |
| `.github/workflows/sync.yml` | GitHub Actions hourly schedule |
