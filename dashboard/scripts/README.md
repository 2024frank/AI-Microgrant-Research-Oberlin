# Oberlin Community Calendar collection

This folder contains the event-source collector used by the dashboard reviewer workflow.

## Run

From `dashboard/`:

- Dry run (no Firestore writes):
  - `npm run collect:oberlin:dry`
- Real run (writes to Firestore):
  - `npm run collect:oberlin`

Optional flags:

- `--only <sourceId>` (example: `--only oberlin_college`)
- `--days-ahead <n>` (default: `180`)

## Environment

For a real run you must provide:

- `FIREBASE_SERVICE_ACCOUNT` (JSON string) via `dashboard/.env.local` or environment.

Never print or commit secrets.

## Behavior (high level)

- Fetches *future* public events from the “ready” sources:
  - Oberlin College Localist
  - Allen Memorial Art Museum
  - Apollo Theatre
  - Oberlin Heritage Center
  - Oberlin College Libraries (LibCal)
  - FAVA Gallery
  - Oberlin Public Library (WhoFi)
  - City of Oberlin
- Leaves Experience Oberlin paused.
- Rejects non-public/restricted + athletics into Firestore `rejected`.
- Skips recurring events and counts them.
- Checks duplicates against:
  - best-effort CommunityHub “allPosts” (if reachable)
  - Firestore `review_queue`
  - Firestore `duplicates`
- Writes:
  - eligible events → Firestore `review_queue` with `status: "pending"`
  - duplicate candidates → Firestore `duplicates` with `status: "pending"`
  - one report per source → Firestore `automation_runs`

