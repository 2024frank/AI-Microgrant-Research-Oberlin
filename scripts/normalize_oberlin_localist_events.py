#!/usr/bin/env python3
"""Oberlin Localist → Civic Calendar normalization pipeline.

Reads raw events from obelrlin_college_events.json, normalizes each into a
Civic Calendar review payload, checks Community Hub and Firestore for
duplicates, writes to Firestore review queue, outputs a local JSON file,
and sends an admin stats email via Resend.

Does NOT submit to Community Hub — that only happens when a human reviewer
clicks Accept/Approve in the frontend.
"""

from __future__ import annotations

import argparse
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

# ---------------------------------------------------------------------------
# Helpers
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


def _fix_common_typos(text: str) -> str:
    fixes = {
        "asssorted": "assorted",
        "occuring": "occurring",
        "recieve": "receive",
        "seperate": "separate",
        "accomodate": "accommodate",
        "occurence": "occurrence",
    }
    for bad, good in fixes.items():
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
    has_address = bool((event.get("address") or "").strip() or (event.get("location_name") or "").strip())
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
    title_lower = ticket_url.lower()
    if "ticket" in title_lower:
        label = "Buy Tickets"
    elif "register" in title_lower or "signup" in title_lower or "forms" in title_lower:
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

    matched_keys: set[str] = set()
    for name in event_type_names:
        if name in kw_map:
            matched_keys.add(kw_map[name])
        for keyword, key in kw_map.items():
            if keyword in name:
                matched_keys.add(key)

    for keyword, key in kw_map.items():
        if keyword in title_lower:
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
# Community Hub duplicate check
# ---------------------------------------------------------------------------

def _normalize_for_compare(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", (s or "").lower()).strip()


def _title_similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalize_for_compare(a), _normalize_for_compare(b)).ratio()


def _sessions_overlap(sessions_a: list[dict], sessions_b: list[dict]) -> bool:
    for sa in sessions_a:
        for sb in sessions_b:
            a_start = sa.get("startTime") or sa.get("start")
            a_end = sa.get("endTime") or sa.get("end")
            b_start = sb.get("startTime") or sb.get("start")
            b_end = sb.get("endTime") or sb.get("end")
            if a_start and b_start and a_start == b_start:
                return True
            if a_start and a_end and b_start and b_end:
                if a_start <= b_end and b_start <= a_end:
                    return True
    return False


def fetch_community_hub_posts() -> list[dict]:
    log.info("Fetching existing posts from Community Hub...")
    try:
        ctx = ssl.create_default_context()
        req = urllib.request.Request(
            COMMUNITY_HUB_API,
            headers={"User-Agent": "CivicCalendarNormalizer/1.0 (fkusiapp@oberlin.edu)"},
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
        import firebase_admin  # noqa: F811
        from firebase_admin import credentials, firestore

        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        project_id = os.environ.get("FIREBASE_PROJECT_ID") or os.environ.get(
            "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
        )

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
        log.warning("Firestore initialization failed: %s — writes will be skipped", exc)
        return False


def _firestore_get_existing_review_ids() -> set[str]:
    if not _firestore_available or not _firestore_db:
        return set()
    try:
        docs = _firestore_db.collection("reviewPosts").stream()
        ids = set()
        for doc in docs:
            data = doc.to_dict()
            ids.add(doc.id)
            src_id = data.get("sourceEventId")
            if src_id:
                ids.add(f"oberlin_localist_{src_id}")
        log.info("Found %d existing review records in Firestore", len(ids))
        return ids
    except Exception as exc:
        log.warning("Failed to read Firestore reviewPosts: %s", exc)
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
        log.error("Firestore write failed for %s: %s", record.get("sourceEventId"), exc)
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
        log.error("Firestore duplicateGroup write failed for %s: %s", group.get("id"), exc)
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
        log.warning("RESEND_API_KEY not set — skipping admin email notification")
        return False

    try:
        import resend as resend_lib
        resend_lib.api_key = api_key

        subject = (
            f"Oberlin Normalizer: {summary['events_normalized']} events processed"
            f" ({summary['duplicates_community_hub']} CH duplicates,"
            f" {summary['duplicates_firestore']} FS duplicates)"
        )

        body_lines = [
            f"<h2>Oberlin Localist Normalization Report</h2>",
            f"<p><strong>Run at:</strong> {run_ts}</p>",
            f"<table style='border-collapse:collapse;'>",
            f"<tr><td style='padding:4px 12px;'>Events read</td><td><strong>{summary['events_read']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Events normalized</td><td><strong>{summary['events_normalized']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Queued for review</td><td><strong>{summary['events_queued_for_review']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Community Hub duplicates</td><td><strong>{summary['duplicates_community_hub']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Firestore duplicates (already queued)</td><td><strong>{summary['duplicates_firestore']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Validation errors</td><td><strong>{summary['events_with_errors']}</strong></td></tr>",
            f"<tr><td style='padding:4px 12px;'>Firestore writes succeeded</td><td><strong>{summary['firestore_writes_succeeded']}</strong></td></tr>",
            f"</table>",
        ]

        resend_lib.Emails.send({
            "from": "Civic Calendar <noreply@uhurued.com>",
            "to": [IMPORTER_EMAIL],
            "subject": subject,
            "html": "\n".join(body_lines),
        })
        log.info("Admin email sent to %s", IMPORTER_EMAIL)
        return True
    except Exception as exc:
        log.error("Failed to send admin email: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Quality / AI analysis (rule-based heuristics)
# ---------------------------------------------------------------------------

def _compute_quality_score(record: dict) -> dict[str, Any]:
    payload = record["civicCalendarPayload"]
    issues: list[str] = []
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

    return {
        "summary": f"Quality score {score}/100 with {len(issues)} issues",
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
        if "title" in f.lower():
            field_notes["title"] = "Title was modified"
        if "description" in f.lower():
            field_notes["description"] = "Description was modified"
        if "post_type" in f.lower():
            field_notes["postTypeId"] = "Post type mapping uncertain"
        if "address" in f.lower() or "location" in f.lower():
            field_notes["location"] = "Location data incomplete"

    return {"overall": overall, "fieldNotes": field_notes}


# ---------------------------------------------------------------------------
# Cross-batch duplicate detection (within normalized batch)
# ---------------------------------------------------------------------------

def detect_batch_duplicates(records: list[dict]) -> list[dict]:
    groups: list[dict] = []
    seen: dict[str, list[int]] = defaultdict(list)

    for idx, rec in enumerate(records):
        payload = rec["civicCalendarPayload"]
        title_norm = _normalize_for_compare(payload.get("title", ""))
        first_start = None
        if payload.get("sessions"):
            first_start = payload["sessions"][0].get("startTime")
        key = f"{title_norm}::{first_start}"
        seen[key].append(idx)

    gid = 1
    for key, indices in seen.items():
        if len(indices) < 2:
            continue
        group_id = f"batch_dup_{gid}"
        primary = records[indices[0]]
        likelies = [records[i] for i in indices[1:]]
        group = {
            "id": group_id,
            "status": "open",
            "primaryCandidateId": f"oberlin_localist_{primary['sourceEventId']}",
            "likelyDuplicateIds": [
                f"oberlin_localist_{r['sourceEventId']}" for r in likelies
            ],
            "similarityScore": 0.95,
            "matchedFields": ["title", "session_start"],
            "conflictingFields": [],
            "recommendation": "Review possible batch duplicates before approval.",
            "createdAt": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
            "updatedAt": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
            "sourceSystem": "oberlin_localist",
        }
        for i in indices:
            records[i]["duplicateCheck"]["groupId"] = group_id
            records[i]["duplicateCheck"]["status"] = "batch_duplicate"
            records[i]["reviewFlags"].append("batch_duplicate_candidate")
        groups.append(group)
        gid += 1

    return groups


# ---------------------------------------------------------------------------
# Main normalize
# ---------------------------------------------------------------------------

def normalize_event(event: dict, config: dict, hub_posts: list[dict], existing_fs_ids: set[str]) -> dict:
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
        record["duplicateCheck"]["conflictingFields"] = match["conflicting_fields"]
        record["reviewFlags"].append("community_hub_duplicate")

    return record


def run_pipeline(input_path: Path, output_path: Path) -> dict[str, Any]:
    config = _load_config()
    raw = json.loads(input_path.read_text(encoding="utf-8"))
    wrapped_events = raw.get("events", [])
    now_iso = dt.datetime.now(tz=dt.timezone.utc).isoformat()

    log.info("Read %d raw events from %s", len(wrapped_events), input_path)

    hub_posts = fetch_community_hub_posts()

    _init_firestore()
    existing_fs_ids = _firestore_get_existing_review_ids()

    records: list[dict] = []
    for item in wrapped_events:
        event = item.get("event", {})
        if not event.get("id"):
            log.warning("Skipping event with no id")
            continue
        record = normalize_event(event, config, hub_posts, existing_fs_ids)
        records.append(record)

    batch_dup_groups = detect_batch_duplicates(
        [r for r in records if r["status"] == "pending_review"]
    )

    ch_dup_groups: list[dict] = []
    ch_dup_idx = 1
    for rec in records:
        if rec["duplicateCheck"]["status"] == "duplicate_in_community_hub":
            group = {
                "id": f"ch_dup_{ch_dup_idx}",
                "status": "open",
                "primaryCandidateId": rec["duplicateCheck"]["candidateIds"][0]
                if rec["duplicateCheck"]["candidateIds"]
                else "",
                "likelyDuplicateIds": [f"oberlin_localist_{rec['sourceEventId']}"],
                "similarityScore": rec["duplicateCheck"]["score"],
                "matchedFields": rec["duplicateCheck"]["matchedFields"],
                "conflictingFields": rec["duplicateCheck"]["conflictingFields"],
                "recommendation": "This event likely already exists in Community Hub. Review before approving.",
                "createdAt": now_iso,
                "updatedAt": now_iso,
                "sourceSystem": "oberlin_localist",
            }
            rec["duplicateCheck"]["groupId"] = group["id"]
            ch_dup_groups.append(group)
            ch_dup_idx += 1

    all_dup_groups = batch_dup_groups + ch_dup_groups

    firestore_writes = 0
    firestore_failures = 0
    for rec in records:
        if rec["status"] == "pending_review":
            if _firestore_write_review_post(rec):
                firestore_writes += 1
            elif _firestore_available:
                firestore_failures += 1
        elif rec["status"] == "duplicate_in_community_hub":
            rec_copy = dict(rec)
            rec_copy["status"] = "pending_duplicate_review"
            if _firestore_write_review_post(rec_copy):
                firestore_writes += 1
            elif _firestore_available:
                firestore_failures += 1

    for group in all_dup_groups:
        _firestore_write_duplicate_group(group)

    counts = {
        "pending_review": sum(1 for r in records if r["status"] == "pending_review"),
        "already_seen": sum(1 for r in records if r["status"] == "already_seen"),
        "duplicate_in_community_hub": sum(
            1 for r in records if r["status"] == "duplicate_in_community_hub"
        ),
        "with_errors": sum(1 for r in records if r["validationErrors"]),
    }

    summary = {
        "events_read": len(wrapped_events),
        "events_normalized": len(records),
        "events_queued_for_review": counts["pending_review"],
        "events_already_seen": counts["already_seen"],
        "duplicates_community_hub": counts["duplicate_in_community_hub"],
        "duplicates_firestore": counts["already_seen"],
        "duplicates_detected": counts["duplicate_in_community_hub"] + len(batch_dup_groups),
        "events_with_errors": counts["with_errors"],
        "records_ready_for_firestore": counts["pending_review"] + counts["duplicate_in_community_hub"],
        "firestore_writes_succeeded": firestore_writes,
        "firestore_writes_failed": firestore_failures,
        "firestore_available": _firestore_available,
    }

    output = {
        "source": str(input_path),
        "normalized_at": now_iso,
        "target": "Civic Calendar review queue",
        "summary": summary,
        "records": records,
        "duplicateGroups": all_dup_groups,
        "metrics": {
            "eventsRead": summary["events_read"],
            "eventsNormalized": summary["events_normalized"],
            "eventsQueuedForReview": summary["events_queued_for_review"],
            "duplicatesCommunityHub": summary["duplicates_community_hub"],
            "duplicatesFirestore": summary["duplicates_firestore"],
            "validationErrors": summary["events_with_errors"],
            "firestoreWrites": firestore_writes,
        },
    }

    output_path.write_text(
        json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    log.info("Wrote normalized output to %s", output_path)

    source_run = {
        "normalized_at": now_iso,
        "source": str(input_path),
        "summary": summary,
        "metrics": output["metrics"],
    }
    _firestore_write_source_run(source_run)

    send_admin_email(summary, now_iso)

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

    summary = run_pipeline(input_path, output_path)

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
            json.dumps(cleared, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
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
