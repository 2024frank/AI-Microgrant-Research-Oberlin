# Automation Agent Guidance

This project uses reviewer feedback to improve event ingestion and filtering.

## Required behavior

- Read `review_queue` documents that were manually rejected.
- Use these fields when present:
  - `rejectionReasonCode`
  - `rejectionReasonText`
  - `rejectedBy`
  - `rejectedAt`
- Treat reviewer rejection feedback as high-priority training signals.
- Update extraction/classification logic to reduce repeat rejections.

## Rejection reason codes

- `not_public`: event is not open to the public
- `not_local`: event is not local/relevant to Oberlin
- `duplicate`: event duplicates an existing listing
- `low_quality`: spammy, weak, or irrelevant content
- `incomplete`: missing required details
- `other`: custom reviewer reason in `rejectionReasonText`

## Tuning loop

1. Collect recent rejected items and reasons.
2. Group by `rejectionReasonCode`.
3. Identify source-specific failure patterns.
4. Patch source extractors, public filters, and duplicate logic.
5. Re-run and verify rejection rates improve.
