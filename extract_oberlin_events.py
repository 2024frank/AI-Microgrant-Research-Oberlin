#!/usr/bin/env python3
"""Extract events from the Oberlin College Localist API."""

import json
import sys
import time
from datetime import datetime, timezone, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

BASE_URL = "https://calendar.oberlin.edu"
MAX_EVENTS = 200
MAX_PAGES = 25
PAGE_SIZE = 100
# Use days=365 window — the Localist API returns far more events this way
# than start_date/end_date when the calendar is between academic terms.
DAYS_WINDOW = 365


def fetch_json(url: str, retries: int = 3) -> dict:
    req = Request(url, headers={"Accept": "application/json", "User-Agent": "ObAgentBot/1.0"})
    for attempt in range(retries):
        try:
            with urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (URLError, HTTPError) as exc:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                raise exc


def _parse_dt(raw: str) -> datetime | None:
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def is_future_event(event: dict, now: datetime) -> bool:
    """Return True if the event's earliest instance start is in the future."""
    instances = event.get("event_instances", [])
    if instances:
        # Collect start times for all instances
        starts = []
        for inst in instances:
            ei = inst.get("event_instance", {})
            dt = _parse_dt(ei.get("start"))
            if dt is not None:
                starts.append(dt)
        if starts:
            earliest = min(starts)
            return earliest >= now

    # Fallback: check first_date field
    dt = _parse_dt(event.get("first_date"))
    if dt is not None:
        # first_date is date-only; treat as start-of-day UTC
        if dt.hour == 0 and dt.minute == 0:
            # Give same-day events the benefit of the doubt
            dt = dt.replace(tzinfo=timezone.utc)
        return dt >= now

    return False


def main():
    now = datetime.now(timezone.utc)
    generated_at = now.isoformat()

    events_out = []
    errors = []
    fetched = 0

    for page in range(1, MAX_PAGES + 1):
        url = (
            f"{BASE_URL}/api/2/events"
            f"?pp={PAGE_SIZE}&page={page}&days={DAYS_WINDOW}"
        )
        try:
            data = fetch_json(url)
        except Exception as exc:
            errors.append({"page": page, "error": str(exc)})
            break

        page_events = data.get("events", [])
        if not page_events:
            break

        for item in page_events:
            if len(events_out) >= MAX_EVENTS:
                break
            fetched += 1

            list_event_wrapper = item  # {"event": {...}}
            raw_list_event = item.get("event", {})
            event_id = raw_list_event.get("id")
            if not event_id:
                continue

            # Fetch detail
            detail_event = {}
            try:
                detail_url = f"{BASE_URL}/api/2/events/{event_id}"
                detail_data = fetch_json(detail_url)
                detail_event = detail_data.get("event", detail_data)
            except Exception as exc:
                errors.append({"event_id": event_id, "error": str(exc)})

            # Use detail event for future check when available, else list event
            check_event = detail_event if detail_event else raw_list_event
            if not is_future_event(check_event, now):
                continue

            event_url = raw_list_event.get("localist_url", "")

            events_out.append({
                "source_id": str(event_id),
                "eventUrl": event_url,
                "listEvent": list_event_wrapper,
                "detailEvent": detail_event,
            })

        if len(events_out) >= MAX_EVENTS:
            break

        # Brief pause between pages to be polite
        time.sleep(0.2)

    output = {
        "source": "oberlin_college",
        "calendarBaseUrl": BASE_URL,
        "generatedAt": generated_at,
        "target": "normalizer_input",
        "dedupePolicy": {
            "key": "source|source_id|startTime",
            "actionIfExistsInProcessedState": "skip",
            "actionIfDuplicateInFirestore": "write_to_rejected_with_reason_duplicate",
        },
        "events": events_out,
        "counts": {
            "fetched": fetched,
            "futureKept": len(events_out),
            "errors": len(errors),
        },
        "errors": errors,
    }

    out_path = "oberlin_college_events.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"fetched: {fetched}")
    print(f"futureKept: {len(events_out)}")
    print(f"errors: {len(errors)}")
    print(f"output: {out_path}")

    if len(events_out) < 30:
        print(f"ERROR: Only {len(events_out)} events kept; expected >30", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
