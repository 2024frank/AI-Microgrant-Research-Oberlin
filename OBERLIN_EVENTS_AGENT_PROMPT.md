# Agent Task: Fetch Oberlin Public Events

You are working in the `AI-Microgrant-Research-Oberlin` repository.

## Branch

Work on this branch:

`obercolleg-events`

If you are not already on that branch, run:

```bash
git switch obercolleg-events
```

After refreshing the JSON file and verifying it, commit the updated event JSON and push to:

```bash
git push origin obercolleg-events
```

Do not push this work to `main`.

## Goal

Fetch raw upcoming event JSON from the Oberlin College Localist calendar API and save only events that are:

- Open to the general public
- Not athletics/sports events

Save the result to:

`obelrlin_college_events.json`

Keep the Localist raw JSON shape. Do not transform the individual event objects into the Civic Calendar schema yet.

## Source API

Use the Oberlin Localist API endpoint:

`https://calendar.oberlin.edu/api/2/events`

Use these query params:

- `days=365`
- `pp=100`
- paginate with `page=1`, `page=2`, etc.

Include an identifying user agent.

## Filtering Rules

For each wrapped event object:

```json
{
  "event": {
    "...": "..."
  }
}
```

Keep the event only if:

```ts
event.filters?.event_public_events?.some(
  (item) => item.name === "Open to all members of the public"
)
```

Exclude the event if its event types or title suggest athletics/sports:

- `athletic`
- `athletics`
- `varsity sports`
- `sports and fitness`

Check these fields:

```ts
event.filters?.event_types
event.title
```

Do not infer public access from `private: false`. Only trust the explicit audience filter.

## Output Format

Write `obelrlin_college_events.json` with this structure:

```json
{
  "source": "https://calendar.oberlin.edu/api/2/events",
  "filters": {
    "audience": "Open to all members of the public",
    "excluded": ["athletic", "athletics", "varsity sports", "sports and fitness"],
    "days": 365
  },
  "summary": {
    "pages_checked": 0,
    "events_checked": 0,
    "events_saved": 0
  },
  "events": []
}
```

The `events` array must contain the raw wrapped Localist event objects exactly as returned by the API.

## Existing Script

There is already a script for this:

`scripts/fetch_oberlin_public_events.py`

Run:

```bash
python3 scripts/fetch_oberlin_public_events.py
```

It should refresh:

`obelrlin_college_events.json`

## Verification

After running it:

1. Confirm the file exists.
2. Confirm `summary.events_saved` is greater than `0`.
3. Inspect a few saved events and confirm each has:
   - `filters.event_public_events` containing `Open to all members of the public`
   - no athletics/sports event type

Do not create Cursor hooks. Do not add automatic session-start behavior. This is just a script another agent can run on demand.
