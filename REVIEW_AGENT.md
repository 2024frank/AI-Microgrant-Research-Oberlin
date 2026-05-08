# Review Agent Guidance

Human review decisions are the source of truth for quality.

## Required behavior

- When rejecting an event from review queue, always provide:
  - a structured `rejectionReasonCode`
  - optional explanatory notes in `rejectionReasonText`
- Keep rejection reasons specific and actionable.
- Prefer short, concrete notes that an automation agent can implement.

## Reason code policy

- `not_public`: restricted/internal audience
- `not_local`: outside local relevance
- `duplicate`: already represented in queue/community
- `low_quality`: poor quality, spam-like, or off-topic
- `incomplete`: lacks key fields required for posting
- `other`: use only when no standard code fits

## Notes quality examples

- Good: "Student-only invite, not open to public."
- Good: "Event is in Cleveland and not tied to Oberlin audience."
- Good: "Same title/time as post ID 4182."
- Avoid: "bad", "no", "wrong"
