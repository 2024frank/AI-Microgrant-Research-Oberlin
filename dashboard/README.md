# Oberlin Community Calendar Dashboard

This dashboard is a source operations dashboard for the Oberlin Community Calendar research project.

Codex automations collect events from public source websites, normalize them, reject ineligible events, detect duplicate candidates, and submit one ingest payload to the dashboard API. The dashboard backend writes queue/report documents to Firestore. The dashboard is for local human review before any approved event is submitted to CommunityHub.

## Current Flow

1. Codex automation fetches source websites and feeds.
2. Events are normalized into a shared internal shape.
3. Non-public, restricted, recurring, athletics, and invalid events are kept out of submission.
4. Duplicate candidates are checked against CommunityHub plus local Firestore queues.
5. Codex posts the run payload to `/api/automation/ingest`.
6. The dashboard backend writes eligible events to `review_queue` and records reports/diagnostics.
7. A reviewer approves or rejects events in the dashboard.
8. Approved events are submitted to CommunityHub for final moderation.

## Firestore Collections

- `allowed_users`: authorized dashboard users; preserve when clearing data.
- `user_activity`: login activity; preserve when clearing data.
- `review_queue`: local approval queue.
- `rejected`: not public, excluded, or failed policy events.
- `duplicates`: duplicate candidates for inspection.
- `automation_runs`: one report per source run.
- `syncs`: legacy/global counters.
- `activity_log`: dashboard activity history.

## Environment

Create `dashboard/.env.local` with Firebase client config and a Firebase Admin service account:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

FIREBASE_SERVICE_ACCOUNT=
AUTOMATION_INGEST_TOKEN=
```

`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is optional unless analytics is used.
`AUTOMATION_INGEST_TOKEN` should be a random secret shared only with the Codex automation that posts source run results.

The old GitHub Actions and Gemini environment variables are no longer required:

```env
GITHUB_PAT=
GEMINI_API_KEY=
```

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful checks:

```bash
npm run lint
npm run build
```

## Codex Automation

The scheduled source collection work should run as a Codex automation, not as a GitHub Action. The dashboard receives completed run payloads through `/api/automation/ingest`; it does not trigger or monitor GitHub workflows.

Codex should POST to the ingest endpoint at the end of each source run:

```http
POST /api/automation/ingest
Authorization: Bearer $AUTOMATION_INGEST_TOKEN
Content-Type: application/json
```

Example payload:

```json
{
  "sourceId": "amam",
  "sourceName": "Allen Memorial Art Museum",
  "startedAt": "2026-05-08T00:00:00.000Z",
  "finishedAt": "2026-05-08T00:01:20.000Z",
  "found": 12,
  "recurringSkipped": 3,
  "queued": [
    {
      "title": "Allen After Hours / Art Hop Pre-Party!",
      "description": "Kick off your Friday night at the Allen...",
      "startTime": 1778275800,
      "endTime": 1778283000,
      "locationName": "Allen Memorial Art Museum",
      "locationAddress": "87 North Main Street, Oberlin, OH 44074",
      "sourceEventUrl": "https://amam.oberlin.edu/exhibitions-events/events/...",
      "writerPayload": {
        "title": "Allen After Hours / Art Hop Pre-Party!",
        "eventType": "ot",
        "postTypeId": [89],
        "calendarSourceName": "Allen Memorial Art Museum",
        "calendarSourceUrl": "https://amam.oberlin.edu/exhibitions-events/events/..."
      }
    }
  ],
  "rejected": [],
  "duplicates": [],
  "errors": []
}
```

Each automation run should write an `automation_runs` document with:

- `found`
- `queued`
- `rejected`
- `duplicates`
- `recurringSkipped`
- `errors`

Every queued CommunityHub payload must include `calendarSourceName` and `calendarSourceUrl`.
