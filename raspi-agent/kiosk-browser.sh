#!/bin/bash
# SignFlow — navegador do quiosque.
# Executado pelo cage (signflow-kiosk.service) como usuário do quiosque.
# O Chromium é relançado sempre que fecha; o agente o fecha para trocar a URL.

URL_FILE=/var/lib/signflow-agent/display_url
PROFILE="$HOME/.config/signflow-kiosk"
LAUNCH_FILE=/tmp/signflow-browser-launch
MAX_WIDTH=1920

CHROMIUM=/usr/lib/chromium/chromium
[ -x "$CHROMIUM" ] || CHROMIUM=$(command -v chromium || command -v chromium-browser)

# TV 4K: força 1080p (a GPU do Pi 4 não renderiza 4K com fluidez)
if command -v wlr-randr >/dev/null 2>&1; then
  wlr-randr 2>/dev/null \
    | awk -v max="$MAX_WIDTH" '/^[^ ]/ {out=$1} /current/ {split($1, r, "x"); if (r[1] > max) print out}' \
    | while read -r out; do
        wlr-randr --output "$out" --mode 1920x1080@60Hz 2>/dev/null \
          || wlr-randr --output "$out" --mode 1920x1080 2>/dev/null
      done
fi

server_of() { echo "$1" | sed -E 's#^(https?://[^/]+).*#\1#'; }

mkdir -p "$PROFILE/Default"
first=1

while true; do
  URL=$(head -n1 "$URL_FILE" 2>/dev/null)
  [ -n "$URL" ] || URL="about:blank"

  # Na primeira abertura, espera o servidor responder (até 90s) para não
  # ficar presa numa página de erro do Chromium
  if [ "$first" = 1 ] && [ "$URL" != "about:blank" ]; then
    SERVER=$(server_of "$URL")
    for _ in $(seq 1 45); do
      curl -fs -o /dev/null --max-time 2 "$SERVER/health" && break
      sleep 2
    done
  fi
  first=0

  # Evita a barra "O Chromium não foi encerrado corretamente"
  sed -i -e 's/"exited_cleanly":false/"exited_cleanly":true/' \
         -e 's/"exit_type":"[A-Za-z]*"/"exit_type":"Normal"/' \
         "$PROFILE/Default/Preferences" 2>/dev/null

  touch "$LAUNCH_FILE"

  # Binário chamado direto (sem o wrapper /usr/bin/chromium) para não herdar
  # --force-renderer-accessibility do Raspberry Pi OS, que custa CPU a cada
  # mudança no DOM (ticker, relógio)
  "$CHROMIUM" \
    --kiosk \
    --ozone-platform=wayland \
    --user-data-dir="$PROFILE" \
    --no-first-run \
    --no-default-browser-check \
    --noerrdialogs \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-translate \
    --disable-features=Translate,TranslateUI,MediaRouter,OptimizationHints,InterestFeedContentSuggestions \
    --disable-sync \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    --disable-component-update \
    --check-for-update-interval=31536000 \
    --password-store=basic \
    --autoplay-policy=no-user-gesture-required \
    --enable-gpu-rasterization \
    --ignore-gpu-blocklist \
    --enable-zero-copy \
    --force-device-scale-factor=1 \
    --lang=pt-BR \
    "$URL"

  sleep 2
done
