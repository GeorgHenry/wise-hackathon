#!/bin/bash
# Asks for the ElevenLabs API key without showing it, checks it against the
# ElevenLabs API, and saves it as ELEVENLABS_API_KEY in the repo's .env.local
# (gitignored). The key is never printed and never put on a command line:
# curl reads the header from stdin, and printf is a shell builtin.
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/.env.local"
API="https://api.elevenlabs.io"

status_of() { # $1 = API path; prints the HTTP status code only
  printf 'xi-api-key: %s\n' "$KEY" |
    curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -H @- "$API$1" 2>/dev/null
}

echo
echo "ElevenLabs key setup for the Wise hackathon voice agent"
echo "Saves to: $ENV_FILE"

while true; do
  echo
  printf 'Paste your ElevenLabs API key and press Enter (typing is hidden): '
  IFS= read -rs KEY
  echo
  KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
  if [ -z "$KEY" ]; then
    echo "Nothing pasted. Try again, or press Ctrl-C to stop."
    continue
  fi

  echo "Checking the key with ElevenLabs..."
  AGENTS="$(status_of '/v1/convai/agents?page_size=1')"
  case "$AGENTS" in
    200) echo "OK: the key can use ElevenLabs Agents."; break ;;
    401) echo "Rejected (401): ElevenLabs does not recognise this key. Copy it again from the dashboard." ;;
    403) echo "The key works but has no ElevenLabs Agents access (403)."
         echo "Give the key Write access to ElevenLabs Agents (Conversational AI) and paste it again." ;;
    000|"") echo "Could not reach api.elevenlabs.io. Check the internet connection and try again." ;;
    *) echo "Unexpected answer from ElevenLabs (HTTP $AGENTS). Try again." ;;
  esac
done

# Optional: show plan and credits left (needs User: Read on the key).
SUB_JSON="$(printf 'xi-api-key: %s\n' "$KEY" |
  curl -sS --max-time 20 -H @- "$API/v1/user/subscription" 2>/dev/null)"
printf '%s' "$SUB_JSON" | python3 -I -c '
import json, sys
try:
    s = json.load(sys.stdin)
    used = s["character_count"]; limit = s["character_limit"]; tier = s.get("tier", "?")
    print(f"Plan: {tier}. Credits used this period: {used:,} of {limit:,} ({limit - used:,} left).")
except Exception:
    print("Credits: not shown (the key has no User: Read access). That is fine.")
' 2>/dev/null || echo "Credits: not shown."

# Save: replace any old ELEVENLABS_API_KEY line, keep every other line.
umask 077
TMP="$(mktemp "$ROOT/.env.local.XXXXXX")"
trap 'rm -f "$TMP"' EXIT
if [ -f "$ENV_FILE" ]; then
  grep -v '^ELEVENLABS_API_KEY=' "$ENV_FILE" > "$TMP" || true
fi
printf 'ELEVENLABS_API_KEY=%s\n' "$KEY" >> "$TMP"
mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"
unset KEY SUB_JSON

if git -C "$ROOT" check-ignore -q "$ENV_FILE"; then
  echo "Saved ELEVENLABS_API_KEY to .env.local (gitignored, readable only by you)."
else
  echo "Saved ELEVENLABS_API_KEY to .env.local, BUT git does not ignore it yet. Do not commit it."
fi
echo "Done. You can close this tab."
