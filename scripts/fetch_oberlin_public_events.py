#!/usr/bin/env python3
"""Fetch raw Oberlin Localist events open to the general public.

The output intentionally keeps the Localist "raw" wrapped event objects so the
review pipeline can inspect the original source shape before mapping fields.
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
from typing import Any
from pathlib import Path


API_URL = "https://calendar.oberlin.edu/api/2/events"
PUBLIC_AUDIENCE = "Open to all members of the public"
USER_AGENT = "CivicCalendarReviewBot/0.1 (fkusiapp@oberlin.edu)"
ATHLETICS_TERMS = ("athletic", "athletics", "varsity sports", "sports and fitness")
DEBUG_LOG_PATH = Path("/Users/fkusiapp/Desktop/dev/AI-Microgrant-Research-Oberlin/.cursor/debug-625505.log")
DEBUG_SESSION_ID = "625505"


def debug_log(run_id: str, hypothesis_id: str, location: str, message: str, data: dict[str, Any]) -> None:
  payload = {
    "sessionId": DEBUG_SESSION_ID,
    "runId": run_id,
    "hypothesisId": hypothesis_id,
    "location": location,
    "message": message,
    "data": data,
    "timestamp": int(time.time() * 1000),
  }
  with DEBUG_LOG_PATH.open("a", encoding="utf-8") as log_file:
    log_file.write(json.dumps(payload, ensure_ascii=False) + "\n")


def fetch_page(page: int, days: int, per_page: int) -> dict[str, Any]:
  params = urllib.parse.urlencode({"days": days, "pp": per_page, "page": page})
  request = urllib.request.Request(
    f"{API_URL}?{params}",
    headers={"User-Agent": USER_AGENT},
  )

  with urllib.request.urlopen(request, timeout=30) as response:
    return json.loads(response.read().decode("utf-8"))


def audience_names(event: dict[str, Any]) -> list[str]:
  return [
    item.get("name", "")
    for item in event.get("filters", {}).get("event_public_events", [])
  ]


def event_type_names(event: dict[str, Any]) -> list[str]:
  return [
    item.get("name", "")
    for item in event.get("filters", {}).get("event_types", [])
  ]


def is_open_to_general_public(event: dict[str, Any]) -> bool:
  return PUBLIC_AUDIENCE in audience_names(event)


def is_athletics(event: dict[str, Any]) -> bool:
  event_types = " ".join(event_type_names(event)).lower()
  title = str(event.get("title", "")).lower()

  return any(term in event_types or term in title for term in ATHLETICS_TERMS)


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--days", type=int, default=365)
  parser.add_argument("--per-page", type=int, default=100)
  parser.add_argument("--max-pages", type=int, default=5)
  parser.add_argument("--output", default="obelrlin_college_events.json")
  args = parser.parse_args()
  run_id = f"run-{int(time.time())}"

  # region agent log
  debug_log(
    run_id,
    "H1",
    "scripts/fetch_oberlin_public_events.py:main",
    "fetch_start",
    {"days": args.days, "per_page": args.per_page, "max_pages": args.max_pages},
  )
  # endregion

  raw_matches: list[dict[str, Any]] = []
  pages_checked = 0
  events_checked = 0

  for page in range(1, args.max_pages + 1):
    payload = fetch_page(page, args.days, args.per_page)
    wrapped_events = payload.get("events", [])
    pages_checked += 1
    events_checked += len(wrapped_events)
    audience_field_present_count = 0
    accepted_count = 0
    rejected_not_public_count = 0
    rejected_athletics_count = 0
    rejected_not_public_examples: list[dict[str, Any]] = []

    for wrapped_event in wrapped_events:
      event = wrapped_event.get("event", {})
      audiences = audience_names(event)
      is_public = is_open_to_general_public(event)
      is_sports = is_athletics(event)
      if event.get("filters", {}).get("event_public_events") is not None:
        audience_field_present_count += 1
      if is_public and not is_sports:
        raw_matches.append(wrapped_event)
        accepted_count += 1
      elif not is_public:
        rejected_not_public_count += 1
        if len(rejected_not_public_examples) < 3:
          rejected_not_public_examples.append(
            {
              "event_id": event.get("id"),
              "title": event.get("title", "")[:120],
              "audiences": audiences,
            }
          )
      else:
        rejected_athletics_count += 1

    # region agent log
    debug_log(
      run_id,
      "H2",
      "scripts/fetch_oberlin_public_events.py:for_page",
      "page_filter_breakdown",
      {
        "page": page,
        "events_in_page": len(wrapped_events),
        "audience_field_present_count": audience_field_present_count,
        "accepted_public_non_athletics": accepted_count,
        "rejected_not_public": rejected_not_public_count,
        "rejected_athletics": rejected_athletics_count,
        "rejected_not_public_examples": rejected_not_public_examples,
      },
    )
    # endregion

    if len(wrapped_events) < args.per_page:
      break

    time.sleep(1.05)

  output = {
    "source": API_URL,
    "filters": {
      "audience": PUBLIC_AUDIENCE,
      "excluded": list(ATHLETICS_TERMS),
      "days": args.days,
    },
    "summary": {
      "pages_checked": pages_checked,
      "events_checked": events_checked,
      "events_saved": len(raw_matches),
    },
    "events": raw_matches,
  }

  with open(args.output, "w", encoding="utf-8") as output_file:
    json.dump(output, output_file, indent=2, ensure_ascii=False)
    output_file.write("\n")

  print(
    f"Saved {len(raw_matches)} raw events from {events_checked} checked events to {args.output}"
  )
  # region agent log
  debug_log(
    run_id,
    "H3",
    "scripts/fetch_oberlin_public_events.py:main",
    "fetch_complete",
    {
      "pages_checked": pages_checked,
      "events_checked": events_checked,
      "events_saved": len(raw_matches),
      "public_audience_label": PUBLIC_AUDIENCE,
      "athletics_terms": list(ATHLETICS_TERMS),
    },
  )
  # endregion


if __name__ == "__main__":
  main()
