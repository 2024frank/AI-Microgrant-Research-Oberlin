#!/usr/bin/env python3
"""Oberlin Localist → Civic Calendar normalization pipeline.

Reads raw events from obelrlin_college_events.json, normalizes each into a
Civic Calendar review payload, checks Community Hub and Firestore for
duplicates, writes to Firestore review queue, outputs a local JSON file,
and sends an admin stats email via Resend.

Does NOT submit to Community Hub — that only happens when a human reviewer
clicks Accept/Approve in the frontend.

Usage:
    python scripts/normalize_oberlin_localist_events.py [options]

Options:
    --input PATH       Raw Localist JSON  (default: obelrlin_college_events.json)
    --output PATH      Normalized output  (default: normalized_oberlin_events_for_review.json)
    --dry-run          Skip Firestore writes, Community Hub fetch, and email
    --skip-email       Skip admin email only
    --clear-input      Zero out the events array in the input file after processing
"""

from __future__ import annotations

import argparse
import copy
import datetime as dt
import json
import logging
import os
import re
import ssl
import sys
import urllib.request
from collections import defaultdict
from difflib import SequenceMatcher
from html import unescape
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("oberlin-normalizer")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
IMPORTER_EMAIL = "frankkusiap@gmail.com"
FALLBACK_CONTACT_EMAIL = "fkusiapp@oberlin.edu"
CALENDAR_SOURCE_NAME = "Oberlin College Calendar"
DEFAULT_SPONSOR = "Oberlin College"

COMMUNITY_HUB_API = (
    "https://oberlin.communityhub.cloud/api/legacy/calendar/posts"
    "?limit=10000&page=0&filter=future&tab=main-feed"
    "&isJobs=false&order=ASC&postType=All&allPosts"
)

SCRIPT_DIR = Path(__file__).resolve().parent
CONFIG_PATH = SCRIPT_DIR / "config" / "civic_calendar_post_type_map.json"

DUPLICATE_TITLE_THRESHOLD = 0.80
DUPLICATE_DATE_WINDOW_SECS = 3600 * 3  # 3 hours

# ---------------------------------------------------------------------------
# Helpers – text cleaning
# ---------------------------------------------------------------------------

def _load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        log.warning("Post type config not found at %s — using empty map", CONFIG_PATH)
        return {"labels": {}, "localist_keyword_map": {}}
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def strip_html(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value or "")
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


_TYPO_FIXES = {
    "asssorted": "assorted",
    "occuring": "occurring",
    "recieve": "receive",
    "seperate": "separate",
    "accomodate": "accommodate",
    "occurence": "occurrence",
    "reccomend": "recommend",
    "definately": "definitely",
    "occassion": "occasion",
    "publically": "publicly",
}


def _fix_common_typos(text: str) -> str:
    for bad, good in _TYPO_FIXES.items():
        text = re.sub(re.escape(bad), good, text, flags=re.IGNORECASE)
    return text


def _clean_short_description(raw: str, source_url: str) -> tuple[str, list[str]]:
    """Return (cleaned, review_flags)."""
    flags: list[str] = []
    text = strip_html(raw)
    text = _fix_common_typos(text)
    text = re.sub(r"\s*More info:\s*https?://\S+", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*[-–—|:]\s*More info:?\s*$", "", text, flags=re.IGNORECASE)
    if source_url:
        text = text.replace(source_url, "").strip()

    if re.match(r"^Watch the (webcast|live ?stream)", text, re.IGNORECASE):
        text = re.sub(
            r"^Watch the (?:webcast|live ?stream)[.!:]*\s*",
            "",
            text,
            flags=re.IGNORECASE,
        )
        if text:
            text = text[0].upper() + text[1:]
        flags.append("description_rewritten_webcast_deemphasized")

    text = text.strip()
    if len(text) > 200:
        cut = text[:197].rsplit(" ", 1)[0]
        text = cut.rstrip(".,;:- ") + "..."
        flags.append("description_truncated")
    if len(text) < 10:
        flags.append("description_too_short")

    return text, flags


def _clean_extended_description(raw_text: str, raw_html: str, source_url: str) -> str:
    text = strip_html(raw_html) if raw_html else raw_text or ""
    text = _fix_common_typos(text)
    text = re.sub(r"\s*More info:\s*https?://\S+", "", text, flags=re.IGNORECASE)
    if source_url:
        text = text.replace(source_url, "").strip()
    return text.strip()


def _clean_title(title: str) -> tuple[str, list[str]]:
    flags: list[str] = []
    t = title.strip()
    if len(t) > 60:
        cut = t[:57].rsplit(" ", 1)[0]
        t = cut.rstrip(".,;:- ") + "..."
        flags.append("title_rewritten_or_truncated")
    return t, flags


# ---------------------------------------------------------------------------
# Field mapping helpers
# ---------------------------------------------------------------------------

def _iso_to_epoch_seconds(iso_str: str | None) -> int | None:
    if not iso_str:
        return None
    parsed = dt.datetime.fromisoformat(iso_str)
    return int(parsed.timestamp())


def _build_sessions(event: dict) -> tuple[list[dict], list[str]]:
    flags: list[str] = []
    sessions: list[dict] = []
    for inst in event.get("event_instances", []):
        ei = inst.get("event_instance", {})
        start = _iso_to_epoch_seconds(ei.get("start"))
        end = _iso_to_epoch_seconds(ei.get("end"))
        if start is None:
            continue
        if end is None:
            end = start
            flags.append("missing_end_time")
        sessions.append({"startTime": start, "endTime": end})
    return sessions, flags


def _map_location_type(event: dict) -> tuple[str, list[str]]:
    flags: list[str] = []
    experience = (event.get("experience") or "").lower()
    has_address = bool(
        (event.get("address") or "").strip()
        or (event.get("location_name") or "").strip()
    )
    has_stream = bool((event.get("stream_url") or "").strip())

    if has_address and has_stream:
        return "bo", flags
    if experience in ("virtual", "online") or (has_stream and not has_address):
        return "on", flags
    if experience == "inperson" or has_address:
        return "ph2", flags
    flags.append("location_type_unclear")
    return "ne", flags


def _resolve_location(event: dict, loc_type: str) -> tuple[str, list[str]]:
    flags: list[str] = []
    if loc_type in ("ph2", "bo"):
        addr = (event.get("address") or "").strip()
        if addr:
            return addr, flags
        loc_name = (event.get("location_name") or "").strip()
        if loc_name:
            flags.append("missing_full_address")
            return loc_name, flags
    return "", flags


def _resolve_sponsors(event: dict) -> list[str]:
    sponsors = [DEFAULT_SPONSOR]
    for dept in event.get("filters", {}).get("departments", []):
        name = (dept.get("name") or "").strip()
        if name and name not in sponsors:
            sponsors.append(name)
    return sponsors


def _resolve_contact_email(event: dict) -> str:
    cf = event.get("custom_fields") or {}
    email = (cf.get("contact_email_address") or "").strip()
    return email if email else FALLBACK_CONTACT_EMAIL


def _resolve_phone(event: dict) -> str:
    cf = event.get("custom_fields") or {}
    return (cf.get("contact_phone_number") or "").strip()


def _resolve_buttons(event: dict) -> list[dict]:
    ticket_url = (event.get("ticket_url") or "").strip()
    if not ticket_url:
        return []
    cost_lower = (event.get("ticket_cost") or "").strip().lower()
    url_lower = ticket_url.lower()
    if "ticket" in url_lower or (cost_lower and "free" not in cost_lower):
        label = "Buy Tickets"
    elif "register" in url_lower or "signup" in url_lower or "forms" in url_lower:
        label = "Register"
    elif "free" in cost_lower:
        label = "Register"
    else:
        label = "Learn More"
    return [{"title": label, "link": ticket_url}]


def _resolve_url_link(event: dict, loc_type: str) -> tuple[str, list[str]]:
    flags: list[str] = []
    if loc_type in ("on", "bo"):
        stream = (event.get("stream_url") or "").strip()
        if stream:
            return stream, flags
        localist = (event.get("localist_url") or "").strip()
        if localist:
            flags.append("online_link_needs_review")
            return localist, flags
    return "", flags


# ---------------------------------------------------------------------------
# Post type mapping
# ---------------------------------------------------------------------------

def _map_post_type_ids(
    event: dict, config: dict[str, Any]
) -> tuple[list[int], list[str]]:
    flags: list[str] = []
    labels_cfg = config.get("labels", {})
    kw_map = config.get("localist_keyword_map", {})

    event_type_names = [
        (f.get("name") or "").strip().lower()
        for f in event.get("filters", {}).get("event_types", [])
    ]
    title_lower = (event.get("title") or "").lower()
    desc_lower = (event.get("description_text") or "").lower()
    combined = f"{title_lower} {desc_lower}"

    matched_keys: set[str] = set()
    for name in event_type_names:
        if name in kw_map:
            matched_keys.add(kw_map[name])
        for keyword, key in kw_map.items():
            if keyword in name:
                matched_keys.add(key)

    for keyword, key in kw_map.items():
        if keyword in combined:
            matched_keys.add(key)

    ids: list[int] = []
    for key in matched_keys:
        entry = labels_cfg.get(key)
        if entry:
            ids.append(entry["id"])

    ids = sorted(set(ids))
    if not ids:
        other = labels_cfg.get("other", {}).get("id", 89)
        ids = [other]
        flags.append("no_confident_post_type_mapping_defaulted_to_other")

    return ids, flags


# ---------------------------------------------------------------------------
# Quality / AI analysis (rule-based heuristics)
# ---------------------------------------------------------------------------

def _compute_quality_score(record: dict) -> dict[str, Any]:
    payload = record["civicCalendarPayload"]
    issues: list[str] = list(record.get("reviewFlags", []))
    score = 100

    if not payload.get("title"):
        issues.append("Missing title")
        score -= 30
    if not payload.get("description") or len(payload.get("description", "")) < 10:
        issues.append("Description too short or missing")
        score -= 20
    if not payload.get("sessions"):
        issues.append("No sessions/dates")
        score -= 25
    if not payload.get("image_cdn_url"):
        issues.append("No image")
        score -= 5
    if record.get("reviewFlags"):
        score -= 3 * len(record["reviewFlags"])

    score = max(10, min(100, score))

    if score >= 85:
        action = "auto_approve_candidate"
    elif score >= 60:
        action = "review_recommended"
    else:
        action = "manual_review_required"

    summary_parts = []
    if payload.get("title"):
        summary_parts.append(f'Event "{payload["title"]}"')
    sessions = payload.get("sessions", [])
    if sessions:
        summary_parts.append(f"with {len(sessions)} session(s)")
    summary = " ".join(summary_parts) if summary_parts else f"Quality score {score}/100"

    return {
        "summary": summary,
        "qualityScore": score,
        "issues": issues,
        "recommendedReviewerAction": action,
    }


def _compute_confidence(record: dict) -> dict[str, Any]:
    errors = record.get("validationErrors", [])
    flags = record.get("reviewFlags", [])
    overall = 1.0 - 0.15 * len(errors) - 0.05 * len(flags)
    overall = round(max(0.1, min(1.0, overall)), 3)

    field_notes: dict[str, str] = {}
    for f in flags:
        fl = f.lower()
        if "title" in fl:
            field_notes["title"] = "Title was modified"
        if "description" in fl:
            field_notes["description"] = "Description was modified"
        if "post_type" in fl:
            field_notes["postTypeId"] = "Post type mapping uncertain"
        if "address" in fl or "location" in fl:
            field_notes["location"] = "Location data incomplete"
        if "end_time" in fl:
            field_notes["sessions"] = "End time was missing; set equal to start time"

    return {"overall": overall, "fieldNotes": field_notes}


# ---------------------------------------------------------------------------
# Community Hub duplicate check
# ---------------------------------------------------------------------------

def _normalize_for_compare(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", (s or "").lower()).strip()


def _title_similarity(a: str, b: str) -> float:
    return SequenceMatcher(
        None, _normalize_for_compare(a), _normalize_for_compare(b)
    ).ratio()


def _sessions_overlap(sessions_a: list[dict], sessions_b: list[dict]) -> bool:
    for sa in sessions_a:
        for sb in sessions_b:
            a_start = sa.get("startTime") or sa.get("start")
            a_end = sa.get("endTime") or sa.get("end")
            b_start = sb.get("startTime") or sb.get("start")
            b_end = sb.get("endTime") or sb.get("end")
            if a_start and b_start:
                if a_start == b_start:
                    return True
                if a_end and b_end and a_start <= b_end and b_start <= a_end:
                    return True
    return False


def _sessions_overlap_window(
    sessions_a: list[dict], sessions_b: list[dict], window: int
) -> bool:
    for sa in sessions_a:
        for sb in sessions_b:
            a_start = sa.get("startTime") or 0
            b_start = sb.get("startTime") or 0
            if abs(a_start - b_start) <= window:
                return True
    return False


def fetch_community_hub_posts() -> list[dict]:
    log.info("Fetching existing posts from Community Hub...")
    try:
        ctx = ssl.create_default_context()
        req = urllib.request.Request(
            COMMUNITY_HUB_API,
            headers={
                "User-Agent": "CivicCalendarNormalizer/1.0 (fkusiapp@oberlin.edu)"
            },
        )
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            data = json.loads(resp.read())
        posts = data.get("posts", [])
        log.info("Fetched %d posts from Community Hub", len(posts))
        return posts
    except Exception as exc:
        log.error("Failed to fetch Community Hub posts: %s", exc)
        return []


def check_community_hub_duplicate(
    record: dict, hub_posts: list[dict]
) -> dict[str, Any]:
    payload = record["civicCalendarPayload"]
    title = payload.get("title", "")
    sessions = payload.get("sessions", [])

    best_match: dict[str, Any] | None = None
    best_score = 0.0

    for hp in hub_posts:
        matched_fields: list[str] = []
        conflicting_fields: list[str] = []
        score = 0.0

        sim = _title_similarity(title, hp.get("name", ""))
        if sim >= 0.85:
            matched_fields.append("title")
            score += sim * 0.6

        hp_sessions = hp.get("sessions", [])
        if sessions and hp_sessions and _sessions_overlap(sessions, hp_sessions):
            matched_fields.append("session_date")
            score += 0.3

        hp_location = ""
        if isinstance(hp.get("location"), dict):
            hp_location = hp["location"].get("name", "")
        my_place = payload.get("placeName", "")
        if my_place and hp_location:
            loc_sim = _title_similarity(my_place, hp_location)
            if loc_sim >= 0.8:
                matched_fields.append("location")
                score += 0.1

        if score > best_score and matched_fields:
            if sim < 1.0 and "title" in matched_fields:
                conflicting_fields.append("title_not_exact")
            best_score = score
            best_match = {
                "hub_post_id": hp.get("id"),
                "hub_post_name": hp.get("name"),
                "score": round(score, 3),
                "matched_fields": matched_fields,
                "conflicting_fields": conflicting_fields,
            }

    if best_match and best_score >= 0.5:
        return {
            "is_duplicate": True,
            "status": "duplicate_in_community_hub",
            "hub_match": best_match,
        }
    return {"is_duplicate": False, "status": "not_in_community_hub"}


# ---------------------------------------------------------------------------
# Firestore integration
# ---------------------------------------------------------------------------

_firestore_db = None
_firestore_available = False


def _init_firestore() -> bool:
    global _firestore_db, _firestore_available
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
            project_id = os.environ.get(
                "FIREBASE_PROJECT_ID"
            ) or os.environ.get("NEXT_PUBLIC_FIREBASE_PROJECT_ID")

            if cred_path and Path(cred_path).exists():
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
            elif project_id:
                firebase_admin.initialize_app(options={"projectId": project_id})
            else:
                log.warning(
                    "No Firebase credentials found. Set GOOGLE_APPLICATION_CREDENTIALS "
                    "or FIREBASE_PROJECT_ID. Firestore writes will be skipped."
                )
                return False

        _firestore_db = firestore.client()
        _firestore_available = True
        log.info("Firestore client initialized successfully")
        return True
    except Exception as exc:
        log.warning(
            "Firestore initialization failed: %s — writes will be skipped", exc
        )
        return False


def _firestore_get_existing_review_ids() -> set[str]:
    if not _firestore_available or not _firestore_db:
        return set()
    try:
        ids = set()
        for collection_name in ("reviewPosts", "approvedPosts"):
            docs = _firestore_db.collection(collection_name).stream()
            for doc in docs:
                data = doc.to_dict()
                ids.add(doc.id)
                src_id = data.get("sourceEventId")
                if src_id:
                    ids.add(f"oberlin_localist_{src_id}")
        log.info(
            "Found %d existing review/approved records in Firestore", len(ids)
        )
        return ids
    except Exception as exc:
        log.warning("Failed to read Firestore collections: %s", exc)
        return set()


def _firestore_write_review_post(record: dict) -> bool:
    if not _firestore_available or not _firestore_db:
        return False
    try:
        doc_id = f"oberlin_localist_{record['sourceEventId']}"
        now = dt.datetime.now(tz=dt.timezone.utc).isoformat()
        doc_data = {
            "id": doc_id,
            "sourceSystem": record["sourceSystem"],
            "sourceEventId": record["sourceEventId"],
            "sourceUrl": record["sourceUrl"],
            "status": record["status"],
            "reviewFlags": record["reviewFlags"],
            "validationErrors": record["validationErrors"],
            "confidence": record["confidence"],
            "aiAnalysis": record["aiAnalysis"],
            "duplicateCheck": record["duplicateCheck"],
            "civicCalendarPayload": record["civicCalendarPayload"],
            "createdAt": now,
            "updatedAt": now,
        }
        _firestore_db.collection("reviewPosts").document(doc_id).set(
            doc_data, merge=True
        )
        return True
    except Exception as exc:
        log.error(
            "Firestore write failed for %s: %s",
            record.get("sourceEventId"),
            exc,
        )
        return False


def _firestore_write_duplicate_group(group: dict) -> bool:
    if not _firestore_available or not _firestore_db:
        return False
    try:
        _firestore_db.collection("duplicateGroups").document(group["id"]).set(
            group, merge=True
        )
        return True
    except Exception as exc:
        log.error(
            "Firestore duplicateGroup write failed for %s: %s",
            group.get("id"),
            exc,
        )
        return False


def _firestore_write_source_run(run: dict) -> bool:
    if not _firestore_available or not _firestore_db:
        return False
    try:
        doc_id = f"oberlin_localist_{run['normalized_at'].replace(':', '-')}"
        _firestore_db.collection("sourceRuns").document(doc_id).set(run)
        return True
    except Exception as exc:
        log.error("sourceRuns write failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Resend email notification
# ---------------------------------------------------------------------------

def send_admin_email(summary: dict, run_ts: str) -> bool:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        log.warning(
            "RESEND_API_KEY not set — skipping admin email notification"
        )
        return False

    try:
        import resend as resend_lib

        resend_lib.api_key = api_key

        subject = (
            f"Oberlin Normalizer: {summary['events_normalized']} events processed"
            f" ({summary['duplicates_community_hub']} CH dupes,"
            f" {summary['duplicates_firestore']} FS dupes,"
            f" {summary['duplicates_batch']} batch dupes)"
        )

        body_lines = [
            "<h2>Oberlin Localist Normalization Report</h2>",
            f"<p><strong>Run at:</strong> {run_ts}</p>",
            "<table style='border-collapse:collapse;font-family:sans-serif;'>",
            f"<tr><td style='padding:4px 12px;'>Events read (raw entries)</td><td><strong>{summary['events_read']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Unique events (after merge)</td><td><strong>{summary['unique_events']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Events normalized</td><td><strong>{summary['events_normalized']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Queued for review</td><td><strong>{summary['events_queued_for_review']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Already in Firestore</td><td><strong>{summary['events_already_seen']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Community Hub duplicates</td><td><strong>{summary['duplicates_community_hub']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Batch duplicates</td><td><strong>{summary['duplicates_batch']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Validation errors</td><td><strong>{summary['events_with_errors']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Firestore writes</td><td><strong>{summary['firestore_writes_succeeded']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Average confidence</td><td><strong>{summary.get('average_confidence', 'N/A')}</strong></td></tr>",
            "</table>",
            "<br><p style='color:#888;font-size:12px;'>Automated message from the Civic Calendar normalization pipeline.</p>",
        ]

        resend_lib.Emails.send(
            {
                "from": "Civic Calendar <noreply@uhurued.com>",
                "to": [IMPORTER_EMAIL],
                "subject": subject,
                "html": "\n".join(body_lines),
            }
        )
        log.info("Admin email sent to %s", IMPORTER_EMAIL)
        return True
    except Exception as exc:
        log.error("Failed to send admin email: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Recurring event merging
# ---------------------------------------------------------------------------

def _merge_recurring_events(wrapped_events: list[dict]) -> list[dict]:
    """Localist may return the same event ID multiple times (once per recurring
    instance page). Merge all event_instances into a single event object."""
    seen: dict[str, dict] = {}
    for item in wrapped_events:
        event = item.get("event", item)
        eid = str(event.get("id", ""))
        if eid not in seen:
            seen[eid] = copy.deepcopy(event)
        else:
            existing_inst_ids = {
                inst.get("event_instance", {}).get("id")
                for inst in seen[eid].get("event_instances", [])
            }
            for inst in event.get("event_instances", []):
                inst_id = inst.get("event_instance", {}).get("id")
                if inst_id not in existing_inst_ids:
                    seen[eid]["event_instances"].append(inst)
                    existing_inst_ids.add(inst_id)
    return list(seen.values())


# ---------------------------------------------------------------------------
# Batch duplicate detection (within-batch, fuzzy)
# ---------------------------------------------------------------------------

def detect_batch_duplicates(records: list[dict]) -> list[dict]:
    """Detect duplicates within the current normalized batch using fuzzy
    title similarity, session overlap, source URL match, and location."""
    groups: list[dict] = []
    n = len(records)
    assigned_group: dict[int, str] = {}
    group_counter = 0

    for i in range(n):
        if i in assigned_group:
            continue
        rec_a = records[i]
        payload_a = rec_a["civicCalendarPayload"]
        members: list[tuple[int, float, list[str], list[str]]] = []

        for j in range(i + 1, n):
            if j in assigned_group:
                continue
            rec_b = records[j]
            payload_b = rec_b["civicCalendarPayload"]

            matched_fields: list[str] = []
            conflicting_fields: list[str] = []
            sim = 0.0

            t_sim = _title_similarity(
                payload_a.get("title", ""), payload_b.get("title", "")
            )
            if t_sim >= DUPLICATE_TITLE_THRESHOLD:
                matched_fields.append("title")
                sim = max(sim, t_sim)

            if rec_a["sourceUrl"] and rec_a["sourceUrl"] == rec_b["sourceUrl"]:
                matched_fields.append("sourceUrl")
                sim = max(sim, 1.0)

            if _sessions_overlap_window(
                payload_a.get("sessions", []),
                payload_b.get("sessions", []),
                DUPLICATE_DATE_WINDOW_SECS,
            ):
                matched_fields.append("session_date")
                sim = min(sim + 0.1, 1.0)

            place_a = payload_a.get("placeName", "")
            place_b = payload_b.get("placeName", "")
            if place_a and place_a == place_b:
                matched_fields.append("placeName")
                sim = min(sim + 0.05, 1.0)

            if len(matched_fields) >= 2 and sim >= DUPLICATE_TITLE_THRESHOLD:
                if payload_a.get("description") != payload_b.get("description"):
                    conflicting_fields.append("description")
                if payload_a.get("location") != payload_b.get("location"):
                    conflicting_fields.append("location")
                if payload_a.get("sessions") != payload_b.get("sessions"):
                    conflicting_fields.append("sessions")
                members.append(
                    (j, round(sim * 100), matched_fields, conflicting_fields)
                )

        if members:
            group_counter += 1
            group_id = f"batch_dup_{group_counter}"
            primary_id = f"oberlin_localist_{rec_a['sourceEventId']}"
            dup_ids: list[str] = []

            rec_a["duplicateCheck"]["status"] = "batch_duplicate"
            rec_a["duplicateCheck"]["groupId"] = group_id
            rec_a["status"] = "pending_duplicate_review"
            rec_a.setdefault("reviewFlags", []).append(
                "batch_duplicate_candidate"
            )
            assigned_group[i] = group_id

            all_matched: list[str] = []
            all_conflict: list[str] = []
            max_score = 0

            for j, score, mf, cf in members:
                dup_doc_id = f"oberlin_localist_{records[j]['sourceEventId']}"
                dup_ids.append(dup_doc_id)
                records[j]["duplicateCheck"]["status"] = "batch_duplicate"
                records[j]["duplicateCheck"]["groupId"] = group_id
                records[j]["duplicateCheck"]["candidateIds"].append(primary_id)
                records[j]["duplicateCheck"]["score"] = score
                records[j]["duplicateCheck"]["matchedFields"] = mf
                records[j]["duplicateCheck"]["conflictingFields"] = cf
                records[j]["status"] = "pending_duplicate_review"
                records[j].setdefault("reviewFlags", []).append(
                    "batch_duplicate_candidate"
                )
                assigned_group[j] = group_id
                all_matched.extend(mf)
                all_conflict.extend(cf)
                max_score = max(max_score, score)

            rec_a["duplicateCheck"]["candidateIds"] = dup_ids
            rec_a["duplicateCheck"]["score"] = max_score
            rec_a["duplicateCheck"]["matchedFields"] = sorted(set(all_matched))
            rec_a["duplicateCheck"]["conflictingFields"] = sorted(
                set(all_conflict)
            )

            now_iso = dt.datetime.now(tz=dt.timezone.utc).isoformat()
            groups.append(
                {
                    "id": group_id,
                    "status": "open",
                    "primaryCandidateId": primary_id,
                    "likelyDuplicateIds": dup_ids,
                    "similarityScore": max_score,
                    "matchedFields": sorted(set(all_matched)),
                    "conflictingFields": sorted(set(all_conflict)),
                    "recommendation": "Review side-by-side and merge or reject duplicate.",
                    "createdAt": now_iso,
                    "updatedAt": now_iso,
                    "sourceSystem": "oberlin_localist",
                }
            )

    return groups


# ---------------------------------------------------------------------------
# Main normalize (single event)
# ---------------------------------------------------------------------------

def normalize_event(
    event: dict,
    config: dict,
    hub_posts: list[dict],
    existing_fs_ids: set[str],
) -> dict:
    source_id = str(event.get("id", ""))
    source_url = (event.get("localist_url") or "").strip()
    raw_event_ref = f"oberlin_localist:{source_id}"
    doc_id = f"oberlin_localist_{source_id}"

    review_flags: list[str] = []
    validation_errors: list[str] = []

    title, title_flags = _clean_title(event.get("title", ""))
    review_flags.extend(title_flags)

    short_desc, desc_flags = _clean_short_description(
        event.get("description_text") or event.get("description") or "",
        source_url,
    )
    review_flags.extend(desc_flags)

    extended_desc = _clean_extended_description(
        event.get("description_text", ""),
        event.get("description", ""),
        source_url,
    )

    sessions, session_flags = _build_sessions(event)
    review_flags.extend(session_flags)

    loc_type, loc_flags = _map_location_type(event)
    review_flags.extend(loc_flags)

    location, addr_flags = _resolve_location(event, loc_type)
    review_flags.extend(addr_flags)

    url_link, url_flags = _resolve_url_link(event, loc_type)
    review_flags.extend(url_flags)

    post_type_ids, pt_flags = _map_post_type_ids(event, config)
    review_flags.extend(pt_flags)

    sponsors = _resolve_sponsors(event)

    payload = {
        "eventType": "ot",
        "email": IMPORTER_EMAIL,
        "subscribe": True,
        "contactEmail": _resolve_contact_email(event),
        "phone": _resolve_phone(event),
        "website": source_url,
        "title": title,
        "sponsors": sponsors,
        "postTypeId": post_type_ids,
        "sessions": sessions,
        "description": short_desc,
        "extendedDescription": extended_desc,
        "locationType": loc_type,
        "location": location,
        "placeId": "",
        "placeName": (event.get("location_name") or "").strip(),
        "roomNum": (event.get("room_number") or "").strip(),
        "urlLink": url_link,
        "image_cdn_url": (event.get("photo_url") or "").strip(),
        "buttons": _resolve_buttons(event),
        "display": "all",
        "screensIds": [],
        "calendarSourceName": CALENDAR_SOURCE_NAME,
        "calendarSourceUrl": source_url,
        "public": "1",
    }

    if not title:
        validation_errors.append("title is required")
    if not sessions:
        validation_errors.append("at least one session is required")
    if loc_type == "ph2" and not location:
        validation_errors.append("physical location requires an address")

    record: dict[str, Any] = {
        "sourceSystem": "oberlin_localist",
        "sourceEventId": source_id,
        "sourceUrl": source_url,
        "rawEventRef": raw_event_ref,
        "status": "pending_review",
        "reviewFlags": review_flags,
        "validationErrors": validation_errors,
        "confidence": {},
        "aiAnalysis": {},
        "duplicateCheck": {
            "status": "not_duplicate",
            "groupId": None,
            "candidateIds": [],
            "score": 0,
            "matchedFields": [],
            "conflictingFields": [],
        },
        "civicCalendarPayload": payload,
    }

    record["confidence"] = _compute_confidence(record)
    record["aiAnalysis"] = _compute_quality_score(record)

    if doc_id in existing_fs_ids:
        record["status"] = "already_seen"
        record["duplicateCheck"]["status"] = "already_in_review_queue"
        return record

    hub_result = check_community_hub_duplicate(record, hub_posts)
    if hub_result["is_duplicate"]:
        record["status"] = "duplicate_in_community_hub"
        record["duplicateCheck"]["status"] = "duplicate_in_community_hub"
        match = hub_result["hub_match"]
        record["duplicateCheck"]["candidateIds"] = [str(match["hub_post_id"])]
        record["duplicateCheck"]["score"] = match["score"]
        record["duplicateCheck"]["matchedFields"] = match["matched_fields"]
        record["duplicateCheck"]["conflictingFields"] = match[
            "conflicting_fields"
        ]
        record["reviewFlags"].append("community_hub_duplicate")

    return record


# ---------------------------------------------------------------------------
# Metrics computation
# ---------------------------------------------------------------------------

def _compute_metrics(records: list[dict], config: dict[str, Any]) -> dict:
    labels_cfg = config.get("labels", {})
    id_to_label: dict[int, str] = {}
    for key, entry in labels_cfg.items():
        if isinstance(entry, dict) and "id" in entry:
            id_to_label[entry["id"]] = entry.get("label", key)

    post_type_dist: dict[str, int] = {}
    for rec in records:
        for pt in rec["civicCalendarPayload"].get("postTypeId", []):
            label = id_to_label.get(pt, f"id_{pt}")
            post_type_dist[label] = post_type_dist.get(label, 0) + 1

    location_type_dist: dict[str, int] = {}
    for rec in records:
        lt = rec["civicCalendarPayload"].get("locationType", "unknown")
        location_type_dist[lt] = location_type_dist.get(lt, 0) + 1

    flag_dist: dict[str, int] = {}
    for rec in records:
        for flag in rec.get("reviewFlags", []):
            flag_dist[flag] = flag_dist.get(flag, 0) + 1

    confidence_values = [
        rec["confidence"]["overall"]
        for rec in records
        if isinstance(rec.get("confidence", {}).get("overall"), (int, float))
    ]
    confidence_buckets = {
        "high_0.9_1.0": 0,
        "good_0.7_0.89": 0,
        "medium_0.5_0.69": 0,
        "low_0_0.49": 0,
    }
    for c in confidence_values:
        if c >= 0.9:
            confidence_buckets["high_0.9_1.0"] += 1
        elif c >= 0.7:
            confidence_buckets["good_0.7_0.89"] += 1
        elif c >= 0.5:
            confidence_buckets["medium_0.5_0.69"] += 1
        else:
            confidence_buckets["low_0_0.49"] += 1

    avg_confidence = (
        round(sum(confidence_values) / len(confidence_values), 3)
        if confidence_values
        else 0
    )

    return {
        "postTypeDistribution": dict(
            sorted(post_type_dist.items(), key=lambda x: -x[1])
        ),
        "locationTypeDistribution": location_type_dist,
        "reviewFlagDistribution": dict(
            sorted(flag_dist.items(), key=lambda x: -x[1])
        ),
        "confidenceDistribution": confidence_buckets,
        "averageConfidence": avg_confidence,
    }


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_pipeline(
    input_path: Path,
    output_path: Path,
    dry_run: bool = False,
    skip_email: bool = False,
) -> dict[str, Any]:
    config = _load_config()
    raw = json.loads(input_path.read_text(encoding="utf-8"))
    wrapped_events = raw.get("events", [])
    now_iso = dt.datetime.now(tz=dt.timezone.utc).isoformat()

    events_read = len(wrapped_events)
    log.info("Read %d raw event entries from %s", events_read, input_path)

    # Merge recurring event instances
    unique_events = _merge_recurring_events(wrapped_events)
    log.info(
        "%d unique events after merging %d recurring entries",
        len(unique_events),
        events_read - len(unique_events),
    )

    # Fetch Community Hub posts for duplicate checking
    hub_posts: list[dict] = []
    if not dry_run:
        hub_posts = fetch_community_hub_posts()
    else:
        log.info("Dry run — skipping Community Hub fetch")

    # Initialize Firestore
    existing_fs_ids: set[str] = set()
    if not dry_run:
        _init_firestore()
        existing_fs_ids = _firestore_get_existing_review_ids()
    else:
        log.info("Dry run — skipping Firestore initialization")

    # Normalize each event
    records: list[dict] = []
    errors_count = 0
    for event in unique_events:
        if not event.get("id"):
            log.warning("Skipping event with no id")
            continue
        try:
            record = normalize_event(event, config, hub_posts, existing_fs_ids)
            records.append(record)
        except Exception as exc:
            errors_count += 1
            log.error("Error normalizing event %s: %s", event.get("id"), exc)

    log.info(
        "Normalized %d events, %d processing errors",
        len(records),
        errors_count,
    )

    # Detect within-batch duplicates among pending_review records
    pending_records = [r for r in records if r["status"] == "pending_review"]
    batch_dup_groups = detect_batch_duplicates(pending_records)

    # Build Community Hub duplicate groups
    ch_dup_groups: list[dict] = []
    ch_dup_idx = 1
    for rec in records:
        if rec["duplicateCheck"]["status"] == "duplicate_in_community_hub":
            group = {
                "id": f"ch_dup_{ch_dup_idx}",
                "status": "open",
                "primaryCandidateId": (
                    rec["duplicateCheck"]["candidateIds"][0]
                    if rec["duplicateCheck"]["candidateIds"]
                    else ""
                ),
                "likelyDuplicateIds": [
                    f"oberlin_localist_{rec['sourceEventId']}"
                ],
                "similarityScore": rec["duplicateCheck"]["score"],
                "matchedFields": rec["duplicateCheck"]["matchedFields"],
                "conflictingFields": rec["duplicateCheck"][
                    "conflictingFields"
                ],
                "recommendation": "This event likely already exists in Community Hub. Review before approving.",
                "createdAt": now_iso,
                "updatedAt": now_iso,
                "sourceSystem": "oberlin_localist",
            }
            rec["duplicateCheck"]["groupId"] = group["id"]
            ch_dup_groups.append(group)
            ch_dup_idx += 1

    all_dup_groups = batch_dup_groups + ch_dup_groups

    # Write to Firestore
    firestore_writes = 0
    firestore_failures = 0
    if not dry_run:
        for rec in records:
            if rec["status"] == "pending_review":
                if _firestore_write_review_post(rec):
                    firestore_writes += 1
                elif _firestore_available:
                    firestore_failures += 1
            elif rec["status"] in (
                "duplicate_in_community_hub",
                "pending_duplicate_review",
            ):
                rec_copy = dict(rec)
                rec_copy["status"] = "pending_duplicate_review"
                if _firestore_write_review_post(rec_copy):
                    firestore_writes += 1
                elif _firestore_available:
                    firestore_failures += 1

        for group in all_dup_groups:
            _firestore_write_duplicate_group(group)
    else:
        log.info("Dry run — skipping Firestore writes")

    # Compute counts
    counts = {
        "pending_review": sum(
            1
            for r in records
            if r["status"] in ("pending_review", "pending_duplicate_review")
        ),
        "already_seen": sum(
            1 for r in records if r["status"] == "already_seen"
        ),
        "ch_duplicates": sum(
            1
            for r in records
            if r["status"] == "duplicate_in_community_hub"
        ),
        "with_errors": sum(1 for r in records if r["validationErrors"]),
    }

    # Compute metrics
    metrics = _compute_metrics(records, config)

    summary = {
        "events_read": events_read,
        "unique_events": len(unique_events),
        "events_normalized": len(records),
        "events_queued_for_review": counts["pending_review"],
        "events_already_seen": counts["already_seen"],
        "duplicates_community_hub": counts["ch_duplicates"],
        "duplicates_batch": len(batch_dup_groups),
        "duplicates_firestore": counts["already_seen"],
        "duplicates_detected": (
            counts["ch_duplicates"] + len(batch_dup_groups)
        ),
        "events_with_errors": counts["with_errors"],
        "records_ready_for_firestore": (
            counts["pending_review"] + counts["ch_duplicates"]
        ),
        "firestore_writes_succeeded": firestore_writes,
        "firestore_writes_failed": firestore_failures,
        "firestore_available": _firestore_available if not dry_run else False,
        "average_confidence": metrics["averageConfidence"],
    }

    output = {
        "source": str(input_path),
        "normalized_at": now_iso,
        "target": "Civic Calendar review queue",
        "summary": summary,
        "records": records,
        "duplicateGroups": all_dup_groups,
        "metrics": metrics,
    }

    output_path.write_text(
        json.dumps(output, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    log.info("Wrote normalized output to %s", output_path)

    # Write source run log
    if not dry_run:
        source_run = {
            "normalized_at": now_iso,
            "source": str(input_path),
            "summary": summary,
            "metrics": metrics,
        }
        _firestore_write_source_run(source_run)

    # Send admin email
    if not dry_run and not skip_email:
        send_admin_email(summary, now_iso)
    elif skip_email:
        log.info("Skipping admin email (--skip-email)")
    else:
        log.info("Dry run — skipping admin email")

    return summary


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Normalize Oberlin Localist events for Civic Calendar review."
    )
    parser.add_argument(
        "--input",
        default="obelrlin_college_events.json",
        help="Path to raw Localist events JSON",
    )
    parser.add_argument(
        "--output",
        default="normalized_oberlin_events_for_review.json",
        help="Path for normalized output JSON",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Skip Firestore writes, Community Hub fetch, and email",
    )
    parser.add_argument(
        "--skip-email",
        action="store_true",
        help="Skip admin email notification only",
    )
    parser.add_argument(
        "--clear-input",
        action="store_true",
        help="Clear the events array in the input file after processing",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        log.error("Input file not found: %s", input_path)
        sys.exit(1)

    summary = run_pipeline(
        input_path,
        output_path,
        dry_run=args.dry_run,
        skip_email=args.skip_email,
    )

    if args.clear_input:
        raw = json.loads(input_path.read_text(encoding="utf-8"))
        cleared = {
            "source": raw.get("source", ""),
            "fetched_at": raw.get("fetched_at", ""),
            "filters": raw.get("filters", {}),
            "summary": raw.get("summary", {}),
            "events": [],
            "_cleared_at": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
            "_cleared_reason": "Events processed by normalization pipeline",
            "_events_processed": summary["events_normalized"],
        }
        input_path.write_text(
            json.dumps(cleared, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        log.info("Cleared events from %s", input_path)

    print("\n" + "=" * 60)
    print("NORMALIZATION COMPLETE")
    print("=" * 60)
    for key, val in summary.items():
        print(f"  {key}: {val}")
    print("=" * 60)


if __name__ == "__main__":
    main()
