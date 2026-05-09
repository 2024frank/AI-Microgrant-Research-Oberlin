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
from datetime import datetime, timezone
from typing import Any


API_URL = "https://calendar.oberlin.edu/api/2/events"
PUBLIC_AUDIENCE = "Open to all members of the public"
USER_AGENT = "CivicCalendarReviewBot/0.1 (fkusiapp@oberlin.edu)"
ATHLETICS_TERMS = ("athletic", "athletics", "varsity sports", "sports and fitness")


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
  parser.add_argument("--max-pages", type=int, default=20)
  parser.add_argument("--output", default="obelrlin_college_events.json")
  args = parser.parse_args()

  fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

  raw_matches: list[dict[str, Any]] = []
  pages_checked = 0
  events_checked = 0
  events_excluded_not_public = 0
  events_excluded_sports = 0

  for page in range(1, args.max_pages + 1):
    print(f"Fetching page {page}...")
    payload = fetch_page(page, args.days, args.per_page)
    wrapped_events = payload.get("events", [])
    pages_checked += 1
    events_checked += len(wrapped_events)

    for wrapped_event in wrapped_events:
      event = wrapped_event.get("event", {})
      if not is_open_to_general_public(event):
        events_excluded_not_public += 1
      elif is_athletics(event):
        events_excluded_sports += 1
      else:
        raw_matches.append(wrapped_event)

    if len(wrapped_events) < args.per_page:
      break

    time.sleep(1.05)

  output = {
    "source": API_URL,
    "fetched_at": fetched_at,
    "filters": {
      "audience": PUBLIC_AUDIENCE,
      "excluded": list(ATHLETICS_TERMS),
      "days": args.days,
    },
    "summary": {
      "pages_checked": pages_checked,
      "events_checked": events_checked,
      "events_saved": len(raw_matches),
      "events_excluded_not_public": events_excluded_not_public,
      "events_excluded_sports": events_excluded_sports,
    },
    "events": raw_matches,
  }

  with open(args.output, "w", encoding="utf-8") as output_file:
    json.dump(output, output_file, indent=2, ensure_ascii=False)
    output_file.write("\n")

  print(
    f"Pages checked: {pages_checked}\n"
    f"Events checked: {events_checked}\n"
    f"Events saved: {len(raw_matches)}\n"
    f"Excluded (not public): {events_excluded_not_public}\n"
    f"Excluded (sports): {events_excluded_sports}\n"
    f"Output: {args.output}"
  )


if __name__ == "__main__":
  main()
