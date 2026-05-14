#!/usr/bin/env python3
"""Normalize Oberlin Localist events for review workflows.

This script intentionally does NOT call Community Hub endpoints during
normalization. Runtime review actions (approve/reject) are represented as
metadata and are only enabled when explicitly configured.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
from collections import defaultdict
from html import unescape
from pathlib import Path
from typing import Any


DEFAULT_EMAIL = "frankkusiap@gmail.com"
DEFAULT_EVENT_TYPE = "ot"
DEFAULT_STATUS = "pending_review"
DEFAULT_SOURCE_NAME = "Oberlin College Calendar"
DEFAULT_SPONSOR = "Oberlin College"
DEFAULT_DISPLAY = "all"
DEFAULT_LOCATION_TYPE = "ph2"
SOURCE_URL_PREFIX = "https://calendar.oberlin.edu/event/"

COMMUNITY_HUB_ENDPOINTS = {
  "submit": "/api/legacy/calendar/post/submit",
  "update_submit": "/api/legacy/calendar/post/{id}/submit",
}

EVENT_TYPE_TO_POST_TYPE = {
  "arts": 2,
  "music": 8,
  "lectures": 6,
  "lecture": 6,
  "academic": 6,
  "workshop": 7,
  "community": 3,
}


def as_bool(value: str | None) -> bool:
  if value is None:
    return False
  return value.strip().lower() in {"1", "true", "yes", "on"}


def strip_html(value: str) -> str:
  text = re.sub(r"<[^>]+>", " ", value or "")
  text = unescape(text)
  text = re.sub(r"\s+", " ", text).strip()
  return text


def clean_description(description: str, source_url: str) -> str:
  text = strip_html(description)
  # Remove trailing "More info:" variants often appended by source systems.
  text = re.sub(r"(?:\s*[-:|])?\s*More info:\s*$", "", text, flags=re.IGNORECASE)
  # Remove any explicit source URL to avoid duplication.
  if source_url:
    text = text.replace(source_url, "").strip()
  return text


def to_epoch_ms(iso_value: str | None) -> int | None:
  if not iso_value:
    return None
  parsed = dt.datetime.fromisoformat(iso_value)
  return int(parsed.timestamp() * 1000)


def map_post_type_ids(event_type_names: list[str]) -> tuple[list[int], list[str]]:
  mapped: list[int] = []
  review_flags: list[str] = []
  for name in event_type_names:
    lookup = name.strip().lower()
    mapped_id = EVENT_TYPE_TO_POST_TYPE.get(lookup)
    if mapped_id is None:
      review_flags.append(f"Uncertain event type mapping: {name}")
      continue
    mapped.append(mapped_id)
  deduped = sorted(set(mapped))
  if not deduped:
    # Safe fallback with explicit review flag.
    deduped = [89]
    review_flags.append("No confident postTypeId mapping; defaulted to [89].")
  return deduped, review_flags


def compute_duplicate_groups(posts: list[dict[str, Any]]) -> list[dict[str, Any]]:
  groups: dict[str, list[str]] = defaultdict(list)
  for post in posts:
    first_session = post["sessions"][0] if post["sessions"] else {"startTime": None}
    start = first_session.get("startTime")
    key = f"{post['title'].strip().lower()}::{start}"
    groups[key].append(post["id"])

  duplicates: list[dict[str, Any]] = []
  duplicate_index = 1
  for ids in groups.values():
    if len(ids) < 2:
      continue
    duplicates.append(
      {
        "id": f"dup-{duplicate_index}",
        "postIds": ids,
        "similarityScore": 0.95,
        "matchingSignals": ["title", "startTime"],
        "conflictFields": [],
        "recommendation": "Review possible duplicate records before approval.",
        "status": "open",
      }
    )
    duplicate_index += 1
  return duplicates


def validate_post(post: dict[str, Any]) -> tuple[list[str], list[str]]:
  errors: list[str] = []
  flags = list(post.get("reviewFlags", []))

  if post.get("eventType") != "ot":
    errors.append("eventType must be ot.")
  if post.get("email") != DEFAULT_EMAIL:
    errors.append("email must match normalizer owner email.")
  if not post.get("calendarSourceUrl"):
    errors.append("calendarSourceUrl is required.")
  if not isinstance(post.get("postTypeId"), list) or not all(isinstance(item, int) for item in post["postTypeId"]):
    errors.append("postTypeId must be array<number>.")
  if DEFAULT_SPONSOR not in post.get("sponsors", []):
    errors.append("sponsors must include Oberlin College.")
  if re.search(r"More info:\s*$", post.get("description", ""), flags=re.IGNORECASE):
    errors.append('description must not end with "More info:".')
  source_url = post.get("calendarSourceUrl", "")
  if source_url and source_url in post.get("description", ""):
    errors.append("description must not append source URL.")
  if not post.get("sessions"):
    flags.append("Missing sessions; requires manual date/time correction.")

  return errors, flags


def calculate_confidence(validation_errors: list[str], review_flags: list[str]) -> float:
  score = 1.0 - 0.15 * len(validation_errors) - 0.05 * len(review_flags)
  return round(max(0.1, score), 3)


def normalize(input_payload: dict[str, Any]) -> dict[str, Any]:
  wrapped_events = input_payload.get("events", [])
  normalized_posts: list[dict[str, Any]] = []
  validation_error_count = 0
  review_needed_count = 0
  mapping_examples: list[dict[str, Any]] = []
  review_flag_examples: list[str] = []

  for wrapped_event in wrapped_events:
    event = wrapped_event.get("event", {})
    source_url = event.get("url") or f"{SOURCE_URL_PREFIX}{event.get('urlname', event.get('id', ''))}"
    event_type_names = [
      item.get("name", "")
      for item in event.get("filters", {}).get("event_types", [])
      if item.get("name")
    ]
    post_type_ids, mapping_flags = map_post_type_ids(event_type_names)
    departments = [
      item.get("name", "")
      for item in event.get("filters", {}).get("departments", [])
      if item.get("name")
    ]
    sponsors = [DEFAULT_SPONSOR, *departments]
    sponsors = sorted(set(sponsors))

    sessions = []
    for instance in event.get("event_instances", []):
      event_instance = instance.get("event_instance", {})
      sessions.append(
        {
          "startTime": to_epoch_ms(event_instance.get("start")),
          "endTime": to_epoch_ms(event_instance.get("end")),
        }
      )

    normalized = {
      "id": f"oberlin-{event.get('id')}",
      "eventType": DEFAULT_EVENT_TYPE,
      "email": DEFAULT_EMAIL,
      "title": str(event.get("title", "")).strip(),
      "description": clean_description(
        str(event.get("description_text") or event.get("description") or ""),
        source_url,
      ),
      "sponsors": sponsors,
      "postTypeId": post_type_ids,
      "sessions": sessions,
      "display": DEFAULT_DISPLAY,
      "screensIds": [],
      "status": DEFAULT_STATUS,
      "sourceName": DEFAULT_SOURCE_NAME,
      "sourceUrl": source_url,
      "calendarSourceUrl": source_url,
      "imageUrl": None,
      "locationType": DEFAULT_LOCATION_TYPE,
      "location": str(event.get("location_name") or event.get("address") or "").strip(),
      "urlLink": str(event.get("ticket_url") or source_url),
      "aiConfidence": None,
      "extractedMetadata": {
        "extractedAt": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
        "model": "oberlin-normalizer-v1",
        "sourceRecordId": str(event.get("id", "")),
      },
      "reviewFlags": mapping_flags,
      "validationErrors": [],
      "confidence": {"overall": 1.0},
      "runtimeActions": {
        "enabled": False,
        "acceptApproveEnabled": False,
        "rejectEnabled": False,
        "communityHubEndpoints": COMMUNITY_HUB_ENDPOINTS,
      },
    }

    validation_errors, review_flags = validate_post(normalized)
    normalized["validationErrors"] = validation_errors
    normalized["reviewFlags"] = sorted(set([*review_flags, *mapping_flags]))
    normalized["confidence"]["overall"] = calculate_confidence(
      normalized["validationErrors"],
      normalized["reviewFlags"],
    )

    if normalized["validationErrors"] or normalized["reviewFlags"]:
      review_needed_count += 1
    validation_error_count += len(normalized["validationErrors"])

    if len(mapping_examples) < 3:
      mapping_examples.append(
        {
          "eventId": normalized["id"],
          "eventTypes": event_type_names,
          "postTypeId": normalized["postTypeId"],
        }
      )
    for flag in normalized["reviewFlags"]:
      if len(review_flag_examples) >= 5:
        break
      if flag not in review_flag_examples:
        review_flag_examples.append(flag)

    normalized_posts.append(normalized)

  duplicate_groups = compute_duplicate_groups(normalized_posts)

  for group in duplicate_groups:
    for post_id in group["postIds"]:
      for post in normalized_posts:
        if post["id"] == post_id:
          post["reviewFlags"] = sorted(set([*post["reviewFlags"], "Duplicate candidate"]))
          break

  source_summary = input_payload.get("summary", {})
  summary = {
    "events_read": int(source_summary.get("events_saved", len(wrapped_events))),
    "events_normalized": len(normalized_posts),
    "duplicates_found": len(duplicate_groups),
    "needing_review": review_needed_count,
    "validation_error_count": validation_error_count,
  }

  return {
    "source": input_payload.get("source", ""),
    "generatedAt": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
    "firestoreWriteMode": "ON" if as_bool(os.getenv("ENABLE_NORMALIZER_FIRESTORE_WRITES")) else "OFF",
    "communityHubWritesExecuted": False,
    "summary": summary,
    "metrics": {
      "eventsRead": summary["events_read"],
      "eventsNormalized": summary["events_normalized"],
      "duplicatesFound": summary["duplicates_found"],
      "needingReview": summary["needing_review"],
      "validationErrors": summary["validation_error_count"],
    },
    "mappingExamples": mapping_examples,
    "reviewFlagExamples": review_flag_examples,
    "duplicateGroups": duplicate_groups,
    "events": normalized_posts,
  }


def maybe_write_firestore_artifacts(output_dir: Path, normalized_payload: dict[str, Any]) -> list[str]:
  if not as_bool(os.getenv("ENABLE_NORMALIZER_FIRESTORE_WRITES")):
    return []

  artifacts_written: list[str] = []
  source_runs_path = output_dir / "sourceRuns.firestore.preview.json"
  review_logs_path = output_dir / "reviewLogs.firestore.preview.json"

  source_run_entry = {
    "createdAt": normalized_payload.get("generatedAt"),
    "source": normalized_payload.get("source"),
    "summary": normalized_payload.get("summary", {}),
    "metrics": normalized_payload.get("metrics", {}),
  }
  review_log_entries = [
    {
      "postId": post["id"],
      "status": post["status"],
      "validationErrors": post["validationErrors"],
      "reviewFlags": post["reviewFlags"],
      "confidence": post["confidence"],
    }
    for post in normalized_payload.get("events", [])
  ]

  source_runs_path.write_text(json.dumps([source_run_entry], indent=2) + "\n", encoding="utf-8")
  review_logs_path.write_text(json.dumps(review_log_entries, indent=2) + "\n", encoding="utf-8")
  artifacts_written.extend([str(source_runs_path), str(review_logs_path)])
  return artifacts_written


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--input", default="obelrlin_college_events.json")
  parser.add_argument("--output", default="normalized_oberlin_events_for_review.json")
  args = parser.parse_args()

  input_path = Path(args.input)
  output_path = Path(args.output)

  payload = json.loads(input_path.read_text(encoding="utf-8"))
  normalized_payload = normalize(payload)
  output_path.write_text(json.dumps(normalized_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

  firestore_artifacts = maybe_write_firestore_artifacts(output_path.parent, normalized_payload)

  print(f"Wrote normalized output to {output_path}")
  print(f"Firestore write mode: {normalized_payload['firestoreWriteMode']}")
  if firestore_artifacts:
    print("Generated Firestore preview artifacts:")
    for artifact in firestore_artifacts:
      print(f" - {artifact}")


if __name__ == "__main__":
  main()
