import unittest

from normalize_oberlin_events import normalize


def wrapped_event(event_id: int, instance_id: int, start: str, end: str) -> dict:
  return {
    "event": {
      "id": event_id,
      "title": "Recurring Public Event",
      "description_text": "A public event with enough descriptive text.",
      "urlname": "recurring-public-event",
      "filters": {
        "event_types": [{"name": "Arts"}],
        "departments": [{"name": "Community Programs"}],
      },
      "event_instances": [
        {
          "event_instance": {
            "id": instance_id,
            "event_id": event_id,
            "start": start,
            "end": end,
          },
        }
      ],
      "location_name": "Oberlin Hall",
    }
  }


class NormalizeOberlinEventsTest(unittest.TestCase):
  def test_recurring_instances_use_review_ui_contract(self) -> None:
    payload = {
      "source": "test",
      "summary": {"events_saved": 2},
      "events": [
        wrapped_event(
          123,
          456,
          "2026-05-09T16:00:00-04:00",
          "2026-05-09T18:30:00-04:00",
        ),
        wrapped_event(
          123,
          789,
          "2026-05-10T16:00:00-04:00",
          "2026-05-10T18:30:00-04:00",
        ),
      ],
    }

    normalized = normalize(payload)
    posts = normalized["events"]

    self.assertEqual([post["id"] for post in posts], ["oberlin-123-456", "oberlin-123-789"])
    self.assertEqual([post["status"] for post in posts], ["pending", "pending"])
    self.assertEqual(posts[0]["sessions"][0]["startTime"], 1778356800)
    self.assertEqual(posts[0]["sessions"][0]["endTime"], 1778365800)


if __name__ == "__main__":
  unittest.main()
