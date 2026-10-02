#!/bin/bash
# Instala a sincronização de hora por HTTP (http-timesync) — servidores e Raspberry Pi.
# Para redes sem servidor NTP e com a porta 123 bloqueada.
#
# Uso:
#   curl -fsSL http://SERVIDOR_SIGNFLOW/api/v1/agent/install-timesync.sh | bash
#   bash install-timesync.sh            (com os arquivos http-timesync* na mesma pasta)
#   bash install-timesync.sh --uninstall
set -euo pipefail

SERVER="__SIGNFLOW_SERVER__"
FILES="http-timesync http-timesync.service http-timesync.timer"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || echo /tmp)"

[ "$(id -u)" = 0 ] || { echo "Execute como root (sudo)"; exit 1; }

if [ "${1:-}" = "--uninstall" ]; then
  systemctl disable --now http-timesync.timer 2>/dev/null || true
  rm -f /usr/local/sbin/http-timesync /etc/systemd/system/http-timesync.service /etc/systemd/system/http-timesync.timer
  systemctl daemon-reload
  echo "http-timesync removido."
  exit 0
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
for f in $FILES; do
  if [ -f "$HERE/$f" ]; then
    cp "$HERE/$f" "$TMP/$f"
  else
    case "$SERVER" in http*) ;; *) echo "Arquivo $f não encontrado e servidor não definido"; exit 1 ;; esac
    curl -fsSL "$SERVER/api/v1/agent/$f" -o "$TMP/$f"
  fi
done
python3 -m py_compile "$TMP/http-timesync"

install -m 755 "$TMP/http-timesync" /usr/local/sbin/http-timesync
install -m 644 "$TMP/http-timesync.service" "$TMP/http-timesync.timer" /etc/systemd/system/

# Serviço antigo do Raspberry (ATUALIZA_HORA): reiniciava a cada ~16 s com precisão de 1 s
if systemctl list-unit-files sync-time.service >/dev/null 2>&1 && systemctl cat sync-time.service >/dev/null 2>&1; then
  systemctl disable --now sync-time.service 2>/dev/null || true
  echo "Serviço antigo sync-time desativado (arquivos mantidos)."
fi

systemctl daemon-reload
systemctl enable --now http-timesync.timer
systemctl start http-timesync.service
echo "Resultado: $(journalctl -u http-timesync.service -n 5 -o cat --no-pager | grep -E "^(OK|AJUSTADO|ERRO)" | tail -1)"
echo "Próximas execuções: no boot e a cada 15 min (systemctl list-timers http-timesync.timer)"
