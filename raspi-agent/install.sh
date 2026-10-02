#!/bin/bash
# SignFlow — provisionamento do Raspberry Pi como display (quiosque).
#
# Uso (no Pi):
#   curl -fsSL http://SERVIDOR/api/v1/agent/install.sh | sudo bash
#   curl -fsSL http://SERVIDOR/api/v1/agent/install.sh | sudo bash -s -- --user senai914
#   sudo bash install.sh --uninstall      # volta para o desktop padrão
#
# Opções:
#   --server URL        servidor SignFlow (padrão: o servidor de onde o script foi baixado)
#   --user NOME         usuário do quiosque (padrão: usuário com UID 1000)
#   --enroll-key CHAVE  chave de registro, se DEVICE_ENROLL_KEY estiver definida no servidor
#   --wifi-band FAIXA   fixa o Wi-Fi em 2.4 ou 5 (GHz) ou auto; padrão: não altera.
#                       Em redes 5 GHz congestionadas, 2.4 costuma ser bem mais estável.
#   --no-reboot         não reinicia ao final
#   --uninstall         remove o quiosque e reativa o desktop (lightdm)
set -euo pipefail

SERVER="__SIGNFLOW_SERVER__"
KIOSK_USER=""
ENROLL_KEY=""
REBOOT=1
UNINSTALL=0
WIFI_BAND=""

AGENT_DIR=/opt/signflow-agent
CONF_DIR=/etc/signflow-agent
STATE_DIR=/var/lib/signflow-agent
BOOT_DIR=/boot/firmware
[ -d "$BOOT_DIR" ] || BOOT_DIR=/boot

while [ $# -gt 0 ]; do
  case "$1" in
    --server) SERVER="$2"; shift 2 ;;
    --user) KIOSK_USER="$2"; shift 2 ;;
    --enroll-key) ENROLL_KEY="$2"; shift 2 ;;
    --wifi-band) WIFI_BAND="$2"; shift 2 ;;
    --no-reboot) REBOOT=0; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    *) echo "Opção desconhecida: $1"; exit 1 ;;
  esac
done

log() { echo -e "\033[1;34m[SignFlow]\033[0m $*"; }
die() { echo -e "\033[1;31m[SignFlow] ERRO:\033[0m $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "execute como root (sudo)"

# ── Desinstalação ───────────────────────────────────────────────────────────
if [ "$UNINSTALL" = 1 ]; then
  log "Removendo quiosque SignFlow..."
  systemctl disable --now signflow-kiosk.service signflow-agent.service 2>/dev/null || true
  rm -f /etc/systemd/system/signflow-kiosk.service /etc/systemd/system/signflow-agent.service
  rm -f /etc/chromium/policies/managed/signflow.json
  # Desfaz os temas de cursor redirecionados para o cursor transparente
  for link in /home/*/.icons/*/cursors; do
    [ "$(readlink "$link")" = /usr/share/icons/signflow-blank/cursors ] && rm -f "$link"
  done
  for theme in /home/*/.icons/default/index.theme; do
    grep -q signflow-blank "$theme" 2>/dev/null && rm -f "$theme"
  done
  systemctl daemon-reload
  systemctl enable lightdm.service 2>/dev/null || true
  systemctl set-default graphical.target
  log "Desktop reativado. Arquivos de boot originais em $BOOT_DIR/*.signflow-bak"
  log "Reinicie com: sudo reboot"
  exit 0
fi

case "$SERVER" in
  http://*|https://*) ;;
  *) die "informe o servidor com --server http://IP_DO_SERVIDOR" ;;
esac
SERVER="${SERVER%/}"

if [ -z "$KIOSK_USER" ]; then
  KIOSK_USER="${SUDO_USER:-}"
  if [ -z "$KIOSK_USER" ] || [ "$KIOSK_USER" = root ]; then
    KIOSK_USER=$(getent passwd 1000 | cut -d: -f1)
  fi
fi
id "$KIOSK_USER" >/dev/null 2>&1 || die "usuário '$KIOSK_USER' não existe"
log "Servidor: $SERVER | Usuário do quiosque: $KIOSK_USER"

curl -fs -o /dev/null --max-time 5 "$SERVER/health" || die "servidor $SERVER não respondeu em /health"

# ── Pacotes ─────────────────────────────────────────────────────────────────
log "Instalando pacotes (cage, chromium, websockets, cec, grim)..."
export DEBIAN_FRONTEND=noninteractive
# IPv4 forçado (redes sem IPv6 falham no archive.raspberrypi.com) e --no-upgrade
# para não atualizar o Chromium já instalado durante o provisionamento
APT_OPTS="-o Acquire::ForceIPv4=true -o Acquire::Retries=3"
apt-get $APT_OPTS update -qq
apt-get $APT_OPTS install -y -qq --no-upgrade cage chromium python3-websockets v4l-utils grim wlr-randr curl >/dev/null

# ── Arquivos do agente ──────────────────────────────────────────────────────
log "Baixando agente de $SERVER..."
mkdir -p "$AGENT_DIR" "$CONF_DIR" "$STATE_DIR"
for f in install.sh signflow_agent.py kiosk-browser.sh signflow-agent.service signflow-kiosk.service; do
  curl -fsSL "$SERVER/api/v1/agent/$f" -o "$AGENT_DIR/$f.new" || die "falha ao baixar $f"
  mv "$AGENT_DIR/$f.new" "$AGENT_DIR/$f"
done
chmod 755 "$AGENT_DIR/install.sh" "$AGENT_DIR/signflow_agent.py" "$AGENT_DIR/kiosk-browser.sh"
python3 -m py_compile "$AGENT_DIR/signflow_agent.py"

cat > "$CONF_DIR/agent.conf" <<EOF
{
  "server": "$SERVER",
  "kiosk_user": "$KIOSK_USER",
  "enroll_key": "$ENROLL_KEY"
}
EOF
chmod 600 "$CONF_DIR/agent.conf"
chmod 755 "$STATE_DIR"

# ── Políticas do Chromium (sem popups, tradução, senhas, login) ─────────────
mkdir -p /etc/chromium/policies/managed
# Local Network Access: libera a página do servidor a carregar mídias do cache
# local do agente (127.0.0.1:8090) sem pedir permissão
cat > /etc/chromium/policies/managed/signflow.json <<EOF
{
  "LocalNetworkAccessAllowedForUrls": ["$SERVER"],
  "InsecurePrivateNetworkRequestsAllowed": true,
  "TranslateEnabled": false,
  "PasswordManagerEnabled": false,
  "BrowserSignin": 0,
  "SyncDisabled": true,
  "DefaultBrowserSettingEnabled": false,
  "AutofillAddressEnabled": false,
  "AutofillCreditCardEnabled": false,
  "MetricsReportingEnabled": false,
  "PromotionalTabsEnabled": false,
  "BackgroundModeEnabled": false,
  "AutoplayAllowed": true,
  "HardwareAccelerationModeEnabled": true
}
EOF

# ── Cursor invisível: o cage desenha a seta do mouse enquanto o Chromium abre ──
# Gera um tema Xcursor com um pixel transparente para todos os cursores padrão
python3 - <<'PYEOF'
import os, struct
d = "/usr/share/icons/signflow-blank/cursors"
os.makedirs(d, exist_ok=True)
size = 24
image = struct.pack("<9I", 36, 0xFFFD0002, size, 1, 1, 1, 0, 0, 0) + struct.pack("<I", 0)
data = struct.pack("<4sIII", b"Xcur", 16, 0x10000, 1) + struct.pack("<III", 0xFFFD0002, size, 28) + image
with open(os.path.join(d, "left_ptr"), "wb") as f:
    f.write(data)
names = """default arrow top_left_arrow pointer hand hand1 hand2 text xterm ibeam watch wait progress
left_ptr_watch half-busy crosshair cross move fleur grab grabbing openhand closedhand dnd-move
not-allowed no-drop forbidden circle help question_arrow whats_this context-menu copy alias cell
vertical-text zoom-in zoom-out all-scroll size_all col-resize row-resize ew-resize ns-resize
nesw-resize nwse-resize n-resize s-resize e-resize w-resize ne-resize nw-resize se-resize sw-resize
sb_h_double_arrow sb_v_double_arrow size_hor size_ver size_bdiag size_fdiag split_h split_v
top_side bottom_side left_side right_side top_left_corner top_right_corner bottom_left_corner
bottom_right_corner""".split()
for name in names:
    link = os.path.join(d, name)
    if not os.path.lexists(link):
        os.symlink("left_ptr", link)
with open("/usr/share/icons/signflow-blank/index.theme", "w") as f:
    f.write("[Icon Theme]\nName=signflow-blank\nComment=Cursor invisivel para o quiosque SignFlow\n")
PYEOF
# O cage usa o tema "default" e o Chromium usa o tema do GTK (no Pi OS, PiXtrix),
# ambos ignorando XCURSOR_THEME. Como ~/.icons tem prioridade sobre /usr/share/icons,
# os cursores desses temas apontam para o transparente — só para o usuário do quiosque.
KIOSK_HOME=$(getent passwd "$KIOSK_USER" | cut -d: -f6)
GTK_THEME_CURSOR=$(runuser -u "$KIOSK_USER" -- gsettings get org.gnome.desktop.interface cursor-theme 2>/dev/null | tr -d "'")
mkdir -p "$KIOSK_HOME/.icons/default"
printf '[Icon Theme]\nInherits=signflow-blank\n' > "$KIOSK_HOME/.icons/default/index.theme"
for theme in default Adwaita PiXtrix PiXflat $GTK_THEME_CURSOR; do
  mkdir -p "$KIOSK_HOME/.icons/$theme"
  ln -sfn /usr/share/icons/signflow-blank/cursors "$KIOSK_HOME/.icons/$theme/cursors"
done
chown -R "$KIOSK_USER:" "$KIOSK_HOME/.icons"

# ── Boot: memória de GPU (decodificação H.264), 1080p e sem blank do console ─
backup() { [ -f "$1.signflow-bak" ] || cp "$1" "$1.signflow-bak"; }

CONFIG_TXT="$BOOT_DIR/config.txt"
backup "$CONFIG_TXT"
if grep -q '^gpu_mem=' "$CONFIG_TXT"; then
  sed -i 's/^gpu_mem=.*/gpu_mem=256/' "$CONFIG_TXT"
else
  printf '\n[all]\ngpu_mem=256\n' >> "$CONFIG_TXT"
fi

CMDLINE="$BOOT_DIR/cmdline.txt"
backup "$CMDLINE"
for param in consoleblank=0 video=HDMI-A-1:1920x1080@60 video=HDMI-A-2:1920x1080@60; do
  grep -qw -- "$param" "$CMDLINE" || sed -i "1 s|\$| $param|" "$CMDLINE"
done

# ── Wi-Fi sem economia de energia (evita engasgos de rede no vídeo) ─────────
mkdir -p /etc/NetworkManager/conf.d
cat > /etc/NetworkManager/conf.d/signflow-wifi-powersave.conf <<'EOF'
[connection]
wifi.powersave = 2
EOF

if [ -n "$WIFI_BAND" ]; then
  case "$WIFI_BAND" in
    2.4) NM_BAND=bg ;; 5) NM_BAND=a ;; auto) NM_BAND="" ;;
    *) die "--wifi-band deve ser 2.4, 5 ou auto" ;;
  esac
  WIFI_CON=$(nmcli -t -f NAME,TYPE con show --active | awk -F: '$2=="802-11-wireless"{print $1; exit}')
  if [ -n "$WIFI_CON" ]; then
    log "Wi-Fi '$WIFI_CON': faixa ${WIFI_BAND} (vale após o reboot)"
    nmcli con modify "$WIFI_CON" 802-11-wireless.band "$NM_BAND"
  fi
fi

# ── Serviços: quiosque no lugar do desktop ──────────────────────────────────
log "Configurando serviços..."
sed "s/__KIOSK_USER__/$KIOSK_USER/" "$AGENT_DIR/signflow-kiosk.service" > /etc/systemd/system/signflow-kiosk.service
cp "$AGENT_DIR/signflow-agent.service" /etc/systemd/system/signflow-agent.service
systemctl daemon-reload
systemctl disable lightdm.service 2>/dev/null || true
systemctl set-default graphical.target
systemctl enable signflow-agent.service signflow-kiosk.service
systemctl restart signflow-agent.service

log "Instalação concluída."
log "Após o reboot a TV mostrará o código de pareamento; vincule o dispositivo"
log "a uma Tela no painel do SignFlow (menu Dispositivos ou Telas)."

if [ "$REBOOT" = 1 ]; then
  log "Reiniciando em 5 segundos..."
  sleep 5
  systemctl reboot
fi
