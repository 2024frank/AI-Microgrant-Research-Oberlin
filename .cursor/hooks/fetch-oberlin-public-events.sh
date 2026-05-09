#!/bin/bash
set -u

# Project-level Cursor automation: refresh the raw Oberlin public events file
# when a Cursor agent session starts. This intentionally fails open so a
# temporary network/API issue does not block normal Cursor work.
if ! command -v python3 >/dev/null 2>&1; then
  echo '{ "additional_context": "python3 is not available, so Oberlin public events were not refreshed." }'
  exit 0
fi

if [[ ! -f "scripts/fetch_oberlin_public_events.py" ]]; then
  echo '{ "additional_context": "Oberlin public events fetch script was not found." }'
  exit 0
fi

python3 scripts/fetch_oberlin_public_events.py >/tmp/civic-calendar-oberlin-events.log 2>&1
status=$?

if [[ $status -eq 0 ]]; then
  summary=$(tr '\n' ' ' </tmp/civic-calendar-oberlin-events.log | sed 's/"/\\"/g')
  echo "{ \"additional_context\": \"Oberlin public events refreshed: ${summary}\" }"
  exit 0
fi

summary=$(tr '\n' ' ' </tmp/civic-calendar-oberlin-events.log | sed 's/"/\\"/g')
echo "{ \"additional_context\": \"Oberlin public events refresh failed but was allowed to continue: ${summary}\" }"
exit 0
