#!/bin/bash
# ============================================================
# Henter gstack, naar en ny Claude-session starter.
#
# Sky-sessioner koerer i en maskine, der ryddes bagefter. Uden det
# her skulle gstack installeres i haanden hver eneste gang.
#
# To regler, der aldrig maa brydes:
#  1. Den maa ALDRIG faa en session til at fejle. Alt er pakket ind,
#     og den slutter altid med exit 0 - ogsaa naar alting gaar galt.
#  2. Den maa ikke tage lang tid, hvis gstack allerede er der.
# ============================================================
set +e
ROOT="$HOME/.claude/skills/gstack"
LOG="$HOME/.claude/gstack-install.log"

# allerede installeret? saa er vi faerdige med det samme
if [ -d "$ROOT/bin" ]; then exit 0; fi

{
  echo "--- $(date -u +%FT%TZ) henter gstack ---"
  timeout 240 git clone --single-branch --depth 1 \
    https://github.com/garrytan/gstack.git "$ROOT" 2>&1 || {
      echo "kunne ikke hente gstack - sessionen koerer videre uden"
      exit 0
    }
  # Chromium kan ikke hentes gennem proxyen her, men der ligger allerede
  # en. Byg den sti, gstack forventer, saa setup ikke spilder tid paa det.
  BRO=$(find /opt/pw-browsers -maxdepth 1 -name 'chromium-*' -type d 2>/dev/null | head -1)
  if [ -n "$BRO" ]; then export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1; fi
  cd "$ROOT" && timeout 420 ./setup --quiet 2>&1
  echo "--- faerdig ---"
} >> "$LOG" 2>&1

exit 0
