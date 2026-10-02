#!/usr/bin/env python3
"""
SignFlow Agent — roda no Raspberry Pi (como root, via systemd).

- Registra o dispositivo no servidor SignFlow e mantém um WebSocket aberto
- Recebe a URL da tela vinculada e reinicia o navegador do quiosque quando muda
- Envia telemetria (temperatura, throttling, Wi-Fi, TV, navegador)
- Executa comandos remotos: restart_browser, reboot, tv_on, tv_off, screenshot, update_agent
- Aplica o agendamento de liga/desliga da TV e o reinício diário do navegador,
  mesmo quando o servidor estiver fora do ar (usa a última configuração recebida)
- Mantém um cache local das mídias da tela (vídeos, banners, logo) servido em
  127.0.0.1:8090, para o telão não depender do Wi-Fi durante a exibição
"""
import asyncio
import glob
import hashlib
import json
import logging
import mimetypes
import os
import pwd
import queue
import shutil
import socket
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from email.utils import parsedate_to_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from websockets.asyncio.client import connect as ws_connect
except ImportError:  # websockets < 13
    from websockets import connect as ws_connect
from websockets.exceptions import ConnectionClosed, InvalidStatus

AGENT_VERSION = "1.5.0"

CONFIG_FILE = "/etc/signflow-agent/agent.conf"
STATE_DIR = "/var/lib/signflow-agent"
STATE_FILE = f"{STATE_DIR}/state.json"
URL_FILE = f"{STATE_DIR}/display_url"
AGENT_DIR = "/opt/signflow-agent"
BROWSER_LAUNCH_FILE = "/tmp/signflow-browser-launch"
PROFILE_MARKER = "signflow-kiosk"  # parte do --user-data-dir do Chromium

STATUS_INTERVAL = 30

TIMESYNC_BIN = "/usr/local/sbin/http-timesync"
# Fontes de hora (cabeçalho HTTP Date), na ordem; o servidor SignFlow é o último recurso
TIME_SOURCES = ["https://www.google.com.br", "https://www.cloudflare.com"]
SCHEDULER_INTERVAL = 20

# Cache local de mídia
CACHE_DIR = f"{STATE_DIR}/media"
CACHE_INDEX = f"{STATE_DIR}/media_index.json"
CACHE_PORT = 8090
CACHE_BASE_URL = f"http://127.0.0.1:{CACHE_PORT}"
MEDIA_SYNC_INTERVAL = 120            # verifica a playlist a cada 2 min
CACHE_CLEANUP_INTERVAL = 6 * 3600    # limpeza periódica de órfãos/downloads abandonados
CACHE_MIN_FREE_BYTES = 2 * 1024**3   # sempre deixa 2 GB livres no cartão
DEFAULT_CACHE_MAX_GB = 16

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("signflow-agent")


# ── Utilitários ─────────────────────────────────────────────────────────────

def read_json(path: str, default: dict) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return dict(default)


def write_file_atomic(path: str, content: str, mode: int = 0o600):
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(content)
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def run(cmd: list, timeout: int = 15, user: str = None) -> subprocess.CompletedProcess:
    """Executa um comando; com `user`, roda dentro da sessão Wayland do quiosque."""
    env = None
    if user:
        pw = pwd.getpwnam(user)
        runtime = f"/run/user/{pw.pw_uid}"
        sockets = sorted(
            p for p in glob.glob(f"{runtime}/wayland-*") if not p.endswith(".lock")
        )
        env = {
            "PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "HOME": pw.pw_dir,
            "XDG_RUNTIME_DIR": runtime,
            "WAYLAND_DISPLAY": os.path.basename(sockets[0]) if sockets else "wayland-0",
        }
        cmd = ["/usr/sbin/runuser", "-u", user, "--"] + cmd
    try:
        return subprocess.run(cmd, capture_output=True, timeout=timeout, env=env)
    except (OSError, subprocess.TimeoutExpired) as e:
        return subprocess.CompletedProcess(cmd, 1, b"", str(e).encode())


def primary_mac() -> str:
    """MAC estável: prefere a interface cabeada (existe no Pi mesmo sem cabo)."""
    for iface in ("eth0", "end0", "wlan0"):
        try:
            with open(f"/sys/class/net/{iface}/address") as f:
                mac = f.read().strip().lower()
            if mac and mac != "00:00:00:00:00:00":
                return mac
        except OSError:
            continue
    for path in sorted(glob.glob("/sys/class/net/*/address")):
        if "/lo/" in path:
            continue
        with open(path) as f:
            mac = f.read().strip().lower()
        if mac and mac != "00:00:00:00:00:00":
            return mac
    raise RuntimeError("Nenhuma interface de rede encontrada")


def local_ip(server_host: str) -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect((server_host, 80))
            return s.getsockname()[0]
    except OSError:
        return ""


def parse_hhmm(value: str):
    try:
        h, m = value.split(":")
        return int(h), int(m)
    except (AttributeError, ValueError):
        return None


# ── Cache local de mídia ────────────────────────────────────────────────────

class MediaCache:
    """
    Baixa as mídias da tela para o cartão SD e as serve localmente.
    O cache espelha a playlist: a cada sincronização o que saiu é apagado na
    hora e o que entrou é baixado (em uma thread, com retomada e verificação).
    Índice: url -> {"file", "size", "last_used"}.
    """

    def __init__(self, max_bytes: int, allowed_host: str):
        self.max_bytes = max_bytes
        self.allowed_host = allowed_host
        self.lock = threading.Lock()
        os.makedirs(CACHE_DIR, exist_ok=True)
        self.index = read_json(CACHE_INDEX, {})
        self.wanted = set()
        # Só apaga mídias depois de saber a playlist atual (evita esvaziar o
        # cache no boot, antes da primeira sincronização com o servidor)
        self.synced = False
        self.pending = set()
        self.queue = queue.Queue()
        self.downloading = None
        self.last_cleanup = 0.0
        threading.Thread(target=self._worker, daemon=True).start()

    # ── Índice ──

    def _save(self):
        with self.lock:
            data = json.dumps(self.index)
        write_file_atomic(CACHE_INDEX, data)

    @staticmethod
    def file_name(url: str) -> str:
        ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
        if not (1 < len(ext) <= 6 and ext[1:].isalnum()):
            ext = ""
        return hashlib.sha1(url.encode()).hexdigest()[:24] + ext

    def lookup(self, url: str):
        with self.lock:
            entry = self.index.get(url)
            if not entry:
                return None
            path = os.path.join(CACHE_DIR, entry["file"])
            entry["last_used"] = time.time()
        if os.path.isfile(path) and os.path.getsize(path) == entry["size"]:
            return path
        return None

    def allowed(self, url: str) -> bool:
        parsed = urllib.parse.urlparse(url)
        return parsed.scheme in ("http", "https") and parsed.hostname == self.allowed_host

    def request(self, url: str):
        """Agenda o download de uma URL (se ainda não estiver no cache)."""
        if not self.allowed(url) or self.lookup(url):
            return
        with self.lock:
            if url in self.pending:
                return
            self.pending.add(url)
        self.queue.put(url)

    def set_wanted(self, urls):
        """Recebe a lista atual de mídias da tela: apaga o que saiu e baixa o que entrou."""
        with self.lock:
            self.wanted = set(urls)
            self.synced = True
        self.prune()
        for url in urls:
            self.request(url)

    def _remove(self, url: str) -> bool:
        with self.lock:
            entry = self.index.pop(url, None)
        if not entry:
            return False
        try:
            os.remove(os.path.join(CACHE_DIR, entry["file"]))
        except OSError:
            pass
        log.info("Removida do cache (fora da playlist): %s", url)
        return True

    def prune(self) -> int:
        """Apaga do cartão as mídias que não estão mais na playlist."""
        if not self.synced:
            return 0
        with self.lock:
            removed_urls = [url for url in self.index if url not in self.wanted]
        removed = sum(1 for url in removed_urls if self._remove(url))
        if removed:
            self._save()
        return removed

    # ── Download ──

    def free_bytes(self) -> int:
        return shutil.disk_usage(CACHE_DIR).free

    def used_bytes(self) -> int:
        with self.lock:
            return sum(e["size"] for e in self.index.values())

    def _has_room(self, needed: int) -> bool:
        return (self.used_bytes() + needed <= self.max_bytes
                and self.free_bytes() - needed >= CACHE_MIN_FREE_BYTES)

    def _worker(self):
        while True:
            url = self.queue.get()
            self.downloading = url
            try:
                if not self.lookup(url):
                    self._download(url)
            except Exception as e:
                log.warning("Falha ao baixar mídia %s: %s", url, e)
            finally:
                self.downloading = None
                with self.lock:
                    self.pending.discard(url)

    def _download(self, url: str):
        name = self.file_name(url)
        path = os.path.join(CACHE_DIR, name)
        part = path + ".part"
        offset = os.path.getsize(part) if os.path.exists(part) else 0
        headers = {"User-Agent": f"SignFlow-Agent/{AGENT_VERSION}"}
        if offset:
            headers["Range"] = f"bytes={offset}-"
        # URLs do MinIO podem ter espaços no nome do arquivo
        req = urllib.request.Request(urllib.parse.quote(url, safe=":/?&=%#+@,;~"), headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 206:
                total = int(resp.headers["Content-Range"].split("/")[-1])
                mode = "ab"
            else:
                offset, mode = 0, "wb"
                total = int(resp.headers.get("Content-Length") or 0)
            if total and not self._has_room(total - offset):
                log.warning("Sem espaço para cachear %s (%d MB) — será transmitida", url, total // 2**20)
                return
            log.info("Baixando mídia (%d MB): %s", total // 2**20, url)
            with open(part, mode) as f:
                while True:
                    chunk = resp.read(256 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
        size = os.path.getsize(part)
        if total and size != total:
            raise IOError(f"download incompleto ({size}/{total} bytes) — será retomado")
        os.replace(part, path)
        with self.lock:
            self.index[url] = {"file": name, "size": size, "last_used": time.time()}
        self._save()
        log.info("Mídia em cache: %s", url)

    # ── Limpeza ──

    def cleanup(self):
        """Limpeza periódica: mídias fora da playlist, arquivos órfãos e
        downloads parciais abandonados."""
        now = time.time()
        with self.lock:
            for url, entry in list(self.index.items()):
                if not os.path.isfile(os.path.join(CACHE_DIR, entry["file"])):
                    del self.index[url]
        removed = self.prune()
        # Arquivos órfãos e downloads parciais abandonados há mais de 1 dia
        with self.lock:
            known = {e["file"] for e in self.index.values()}
        downloading = self.downloading
        active = self.file_name(downloading) if downloading else None
        for path in glob.glob(os.path.join(CACHE_DIR, "*")):
            base = os.path.basename(path)
            if base in known or (active and base.startswith(active)):
                continue
            if not base.endswith(".part") or now - os.path.getmtime(path) > 86400:
                try:
                    os.remove(path)
                    removed += 1
                except OSError:
                    pass
        self.last_cleanup = now
        self._save()
        if removed:
            log.info("Limpeza do cache: %d arquivo(s) removido(s)", removed)

    def stats(self) -> dict:
        with self.lock:
            files = len(self.index)
            pending = len(self.pending)
            wanted = len(self.wanted)
            ready = sum(1 for u in self.wanted if u in self.index)
        return {
            "cache_files": files,
            "cache_mb": round(self.used_bytes() / 2**20),
            "cache_pending": pending,
            "cache_ready": f"{ready}/{wanted}",
            "disk_free_gb": round(self.free_bytes() / 1024**3, 1),
        }


def make_cache_handler(cache: MediaCache):
    class CacheHandler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *args):
            pass

        def _cors(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.send_header("Access-Control-Allow-Local-Network", "true")

        def do_OPTIONS(self):
            self.send_response(204)
            self._cors()
            self.send_header("Access-Control-Allow-Methods", "GET, HEAD")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_HEAD(self):
            self.do_GET(body=False)

        def do_GET(self, body: bool = True):
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path == "/health":
                self.send_response(200)
                self._cors()
                self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", "2")
                self.end_headers()
                if body:
                    self.wfile.write(b"ok")
                return
            if parsed.path != "/media":
                self.send_error(404)
                return
            url = urllib.parse.parse_qs(parsed.query).get("u", [""])[0]
            if not cache.allowed(url):
                self.send_error(400)
                return
            path = cache.lookup(url)
            if not path:
                # Ainda não baixada: transmite do servidor e agenda o download
                cache.request(url)
                self.send_response(302)
                self._cors()
                self.send_header("Location", urllib.parse.quote(url, safe=":/?&=%#+@,;~"))
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            self._serve_file(path, url, body)

        def _serve_file(self, path: str, url: str, body: bool):
            size = os.path.getsize(path)
            start, end, status = 0, size - 1, 200
            rng = self.headers.get("Range", "")
            if rng.startswith("bytes="):
                first, _, last = rng[6:].split(",")[0].strip().partition("-")
                try:
                    if first:
                        start = int(first)
                        end = min(int(last), size - 1) if last else size - 1
                    else:
                        start = max(0, size - int(last))
                except ValueError:
                    start, end = 0, size - 1
                if start > end or start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                status = 206
            self.send_response(status)
            self._cors()
            mime = mimetypes.guess_type(urllib.parse.urlparse(url).path)[0]
            self.send_header("Content-Type", mime or "application/octet-stream")
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "max-age=3600")
            if status == 206:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.end_headers()
            if not body:
                return
            try:
                with open(path, "rb") as f:
                    f.seek(start)
                    remaining = end - start + 1
                    while remaining > 0:
                        chunk = f.read(min(256 * 1024, remaining))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
            except (BrokenPipeError, ConnectionResetError):
                pass

    return CacheHandler


# ── Agente ──────────────────────────────────────────────────────────────────

class Agent:
    def __init__(self):
        conf = read_json(CONFIG_FILE, {})
        self.server = conf.get("server", "").rstrip("/")
        if not self.server:
            raise SystemExit(f"'server' não configurado em {CONFIG_FILE}")
        self.kiosk_user = conf.get("kiosk_user", "pi")
        self.enroll_key = conf.get("enroll_key", "")
        self.server_host = self.server.split("://", 1)[-1].split("/")[0].split(":")[0]

        os.makedirs(STATE_DIR, exist_ok=True)
        self.state = read_json(STATE_FILE, {})
        self.ws = None
        self.tv_state = "unknown"
        self.tv_method = None
        self.cec_device = None
        self.last_schedule_state = None
        self.last_daily_restart = None
        self.server_down_since = None
        self.clock_offset = None
        self.media_cache = None
        if conf.get("media_cache", True):
            max_gb = float(conf.get("cache_max_gb", DEFAULT_CACHE_MAX_GB))
            self.media_cache = MediaCache(int(max_gb * 1024**3), self.server_host)
        self.sync_event = None

    # ── Estado persistente ──────────────────────────────────────────────────

    def save_state(self):
        write_file_atomic(STATE_FILE, json.dumps(self.state, indent=2))

    @property
    def config(self) -> dict:
        return self.state.get("config") or {}

    @property
    def settings(self) -> dict:
        return self.config.get("settings") or {}

    # ── Registro e conexão ──────────────────────────────────────────────────

    def http(self, method: str, path: str, body: bytes = None, headers: dict = None, timeout: int = 15):
        req = urllib.request.Request(
            f"{self.server}{path}", data=body, method=method, headers=headers or {}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()

    def register(self):
        payload = {
            "mac": primary_mac(),
            "hostname": socket.gethostname(),
            "ip": local_ip(self.server_host),
            "agent_version": AGENT_VERSION,
            "enroll_key": self.enroll_key or None,
        }
        raw = self.http(
            "POST", "/api/v1/devices/register",
            json.dumps(payload).encode(), {"Content-Type": "application/json"},
        )
        data = json.loads(raw)
        self.state["device_id"] = data["device_id"]
        self.state["token"] = data["token"]
        self.save_state()
        log.info("Dispositivo registrado: %s", data["device_id"])

    async def run_forever(self):
        self.apply_display_url()  # usa a última configuração enquanto conecta
        asyncio.create_task(self.scheduler_loop())
        if self.media_cache:
            self.sync_event = asyncio.Event()
            server = ThreadingHTTPServer(("127.0.0.1", CACHE_PORT), make_cache_handler(self.media_cache))
            server.daemon_threads = True
            threading.Thread(target=server.serve_forever, daemon=True).start()
            log.info("Cache de mídia em %s (máx. %d GB)", CACHE_BASE_URL, self.media_cache.max_bytes // 1024**3)
            asyncio.create_task(self.media_sync_loop())
        backoff = 2
        while True:
            try:
                if not self.state.get("token"):
                    await asyncio.to_thread(self.register)
                await self.session()
                backoff = 2
            except InvalidStatus as e:
                status = getattr(getattr(e, "response", None), "status_code", None)
                log.warning("Servidor recusou o WebSocket (HTTP %s)", status)
                if status in (401, 403):
                    self.state.pop("token", None)
            except (OSError, urllib.error.URLError, ConnectionClosed, asyncio.TimeoutError) as e:
                log.warning("Sem conexão com o servidor: %s", e)
            except Exception:
                log.exception("Erro inesperado na sessão")
            if self.server_down_since is None:
                self.server_down_since = time.time()
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)

    async def session(self):
        ws_base = "wss" + self.server[5:] if self.server.startswith("https") else "ws" + self.server[4:]
        url = f"{ws_base}/ws/device/{self.state['device_id']}?token={self.state['token']}"
        async with ws_connect(url, ping_interval=20, ping_timeout=20, open_timeout=10) as ws:
            self.ws = ws
            log.info("Conectado ao servidor %s", self.server)
            self.recover_after_outage()
            status_task = asyncio.create_task(self.status_loop())
            try:
                async for raw in ws:
                    await self.handle_message(json.loads(raw))
            except ConnectionClosed as e:
                if e.rcvd and e.rcvd.code == 4401:
                    log.warning("Token rejeitado — registrando novamente")
                    self.state.pop("token", None)
                raise
            finally:
                status_task.cancel()
                self.ws = None

    def recover_after_outage(self):
        """Se o navegador abriu enquanto o servidor estava fora, ele mostra uma
        página de erro que nunca se recupera sozinha: reabre o navegador."""
        down_since, self.server_down_since = self.server_down_since, None
        if down_since is None:
            return
        try:
            launched_at = os.path.getmtime(BROWSER_LAUNCH_FILE)
        except OSError:
            return
        if launched_at >= down_since - 5:
            log.info("Servidor voltou — reiniciando navegador aberto durante a queda")
            self.restart_browser()

    async def send(self, message: dict):
        if self.ws is not None:
            try:
                await self.ws.send(json.dumps(message))
            except ConnectionClosed:
                pass

    # ── Mensagens do servidor ───────────────────────────────────────────────

    async def handle_message(self, msg: dict):
        event = msg.get("event")
        if event == "DEVICE_CONFIG":
            self.state["config"] = msg
            self.save_state()
            self.last_schedule_state = None  # reavalia o agendamento com a nova config
            self.apply_display_url()
            self.trigger_media_sync()
            await self.send_status()
        elif event == "SYNC_MEDIA":
            self.trigger_media_sync()
        elif event == "COMMAND":
            asyncio.create_task(self.execute_command(msg.get("id"), msg.get("command")))
        elif event == "STATUS_ACK":
            try:
                server_time = datetime.fromisoformat(msg["server_time"])
                self.clock_offset = round(time.time() - server_time.timestamp())
            except (KeyError, ValueError):
                pass

    def display_url(self) -> str:
        path = self.config.get("display_path")
        if path:
            # O telão usa o cache local de mídia quando este parâmetro está presente
            if self.media_cache:
                return f"{self.server}{path}?cache={CACHE_BASE_URL}"
            return f"{self.server}{path}"
        if self.state.get("device_id"):
            return f"{self.server}/pair/{self.state['device_id']}"
        return f"{self.server}/pair/novo"

    def apply_display_url(self):
        url = self.display_url()
        try:
            with open(URL_FILE, encoding="utf-8") as f:
                current = f.read().strip()
        except OSError:
            current = ""
        if url != current:
            write_file_atomic(URL_FILE, url + "\n", mode=0o644)
            log.info("URL do quiosque: %s", url)
            if current:
                self.restart_browser()

    async def execute_command(self, command_id: str, command: str):
        log.info("Comando recebido: %s", command)
        handlers = {
            "restart_browser": self.cmd_restart_browser,
            "reboot": self.cmd_reboot,
            "shutdown": self.cmd_shutdown,
            "tv_on": lambda: self.set_tv(True),
            "tv_off": lambda: self.set_tv(False),
            "screenshot": self.cmd_screenshot,
            "update_agent": self.cmd_update_agent,
            "sync_time": self.cmd_sync_time,
        }
        handler = handlers.get(command)
        if handler is None:
            ok, message = False, f"Comando desconhecido: {command}"
        else:
            try:
                ok, message = await asyncio.to_thread(handler)
            except Exception as e:
                log.exception("Falha no comando %s", command)
                ok, message = False, str(e)
        await self.send({
            "event": "COMMAND_RESULT", "id": command_id, "command": command,
            "ok": ok, "message": message,
        })
        if ok and command == "reboot":
            await asyncio.sleep(2)
            run(["systemctl", "reboot"])
        if ok and command == "shutdown":
            await asyncio.sleep(2)
            run(["systemctl", "poweroff"])
        if ok and command == "update_agent":
            await asyncio.sleep(1)
            os._exit(0)  # systemd reinicia o serviço com o novo código

    # ── Cache de mídia ──────────────────────────────────────────────────────

    def trigger_media_sync(self):
        if self.sync_event is not None:
            self.sync_event.set()

    @staticmethod
    def media_urls(data: dict) -> list:
        urls = []
        for group in data.get("banner_groups") or []:
            urls += [b.get("file_url") for b in group]
        urls += [b.get("file_url") for b in data.get("banners") or []]
        urls += [v.get("video_url") for v in data.get("videos") or []]
        urls.append(data.get("company_logo_url"))
        unique = []
        for url in urls:
            if url and url not in unique:
                unique.append(url)
        return unique

    def sync_media(self):
        path = self.config.get("display_path") or ""
        if path:
            screen_id = path.rsplit("/", 1)[-1]
            raw = self.http("GET", f"/api/v1/display/{screen_id}/data", timeout=20)
            urls = self.media_urls(json.loads(raw))
        else:
            urls = []
        self.media_cache.set_wanted(urls)
        if time.time() - self.media_cache.last_cleanup > CACHE_CLEANUP_INTERVAL:
            self.media_cache.cleanup()

    async def media_sync_loop(self):
        while True:
            try:
                await asyncio.wait_for(self.sync_event.wait(), MEDIA_SYNC_INTERVAL)
                await asyncio.sleep(3)  # aguarda o servidor gravar a alteração
            except asyncio.TimeoutError:
                pass
            self.sync_event.clear()
            try:
                await asyncio.to_thread(self.sync_media)
            except Exception as e:
                log.warning("Falha ao sincronizar mídias: %s", e)

    # ── Navegador ───────────────────────────────────────────────────────────

    def browser_running(self) -> bool:
        return run(["pgrep", "-f", PROFILE_MARKER]).returncode == 0

    def restart_browser(self) -> bool:
        # kiosk-browser.sh relança o Chromium (lendo a URL atual) assim que ele fecha
        run(["pkill", "-TERM", "-f", PROFILE_MARKER])
        for _ in range(20):
            if not self.browser_running():
                return True
            time.sleep(0.5)
        run(["pkill", "-KILL", "-f", PROFILE_MARKER])
        return True

    def cmd_restart_browser(self):
        self.restart_browser()
        return True, "Navegador reiniciado"

    def cmd_reboot(self):
        return True, "Reiniciando o Raspberry Pi"

    def cmd_shutdown(self):
        return True, "Desligando o Raspberry Pi (para religar, desligue e religue a energia)"

    # ── Hora ────────────────────────────────────────────────────────────────

    @staticmethod
    def http_time(url: str) -> float:
        """Hora (epoch) pelo cabeçalho Date de uma resposta HTTP, compensando a rede.
        Sem verificar certificado: com o relógio muito errado o TLS falharia
        justamente quando a hora precisa ser corrigida."""
        ctx = ssl._create_unverified_context() if url.startswith("https") else None
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "SignFlow-Agent"})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
                date = resp.headers.get("Date")
        except urllib.error.HTTPError as e:
            date = e.headers.get("Date")  # até uma resposta de erro (ex.: 405 no HEAD) traz a hora
        t1 = time.time()
        if not date:
            raise ValueError("resposta sem cabeçalho Date")
        # Date tem resolução de 1 s (truncado): +0,5 s em média, mais metade da ida e volta
        return parsedate_to_datetime(date).timestamp() + 0.5 + (time.time() - t1) + (t1 - t0) / 2

    def cmd_sync_time(self):
        # Preferência: http-timesync (precisão de centésimos; instalado pelo install.sh)
        if os.path.exists(TIMESYNC_BIN):
            r = run([TIMESYNC_BIN], timeout=90)
            out = r.stdout.decode(errors="replace").strip().splitlines()
            message = out[-1] if out else r.stderr.decode(errors="replace").strip()[:300]
            return r.returncode == 0, message
        errors = []
        for url in TIME_SOURCES + [f"{self.server}/health"]:
            try:
                epoch = self.http_time(url)
                break
            except Exception as e:
                errors.append(f"{urllib.parse.urlparse(url).hostname}: {e}")
        else:
            return False, "Nenhuma fonte de hora respondeu (" + "; ".join(errors)[:300] + ")"

        source = urllib.parse.urlparse(url).hostname
        offset = epoch - time.time()
        if abs(offset) < 1.5:
            return True, f"Hora já estava correta (diferença {offset:+.1f}s, fonte {source})"
        r = run(["date", "-s", f"@{epoch:.3f}"])
        if r.returncode != 0:
            return False, "Falha ao ajustar o relógio: " + r.stderr.decode(errors="replace")[:200]
        log.info("Relógio ajustado em %+.1fs (fonte %s)", offset, source)
        return True, f"Hora ajustada em {offset:+.0f}s (fonte {source}) — agora {datetime.now():%d/%m %H:%M:%S}"

    # ── TV (HDMI-CEC com fallback para desligar a saída HDMI) ───────────────

    def find_cec_device(self):
        if self.cec_device:
            return self.cec_device
        for dev in sorted(glob.glob("/dev/cec*")):
            out = run(["cec-ctl", "-d", dev, "--playback", "-o", "SignFlow"]).stdout.decode(errors="replace")
            for line in out.splitlines():
                if "Physical Address" in line:
                    addr = line.split(":", 1)[1].strip()
                    if addr and addr != "f.f.f.f":
                        self.cec_device = (dev, addr)
                        return self.cec_device
        return None

    def cec(self, on: bool):
        found = self.find_cec_device()
        if not found:
            return False, "TV sem HDMI-CEC detectado"
        dev, addr = found
        if on:
            r = run(["cec-ctl", "-d", dev, "--to", "0", "--image-view-on"])
            run(["cec-ctl", "-d", dev, "--to", "0", "--active-source", f"phys-addr={addr}"])
        else:
            r = run(["cec-ctl", "-d", dev, "--to", "0", "--standby"])
        out = r.stdout.decode(errors="replace")
        if r.returncode == 0 and "Not Acknowledged" not in out and "NACK" not in out:
            return True, "Comando CEC enviado"
        self.cec_device = None
        return False, "TV não respondeu ao CEC"

    def hdmi_outputs(self):
        out = run(["wlr-randr"], user=self.kiosk_user).stdout.decode(errors="replace")
        return [line.split()[0] for line in out.splitlines() if line and not line[0].isspace()]

    def hdmi(self, on: bool):
        outputs = self.hdmi_outputs()
        if not outputs:
            return False, "Saída de vídeo não encontrada"
        ok = all(
            run(["wlr-randr", "--output", o, "--on" if on else "--off"], user=self.kiosk_user).returncode == 0
            for o in outputs
        )
        return ok, "Sinal HDMI " + ("ligado" if on else "desligado") if ok else "Falha ao alterar saída HDMI"

    def cec_power_status(self):
        """Estado de energia informado pela TV via CEC (on/standby/...) ou None."""
        found = self.find_cec_device()
        if not found:
            return None
        out = run(["cec-ctl", "-d", found[0], "--to", "0", "--give-device-power-status"]).stdout.decode(errors="replace")
        for line in out.splitlines():
            if "pwr-state:" in line:
                return line.split(":", 1)[1].split("(")[0].strip()
        return None

    def set_tv(self, on: bool):
        """
        auto: liga/desliga pelo HDMI-CEC E liga/corta o sinal HDMI. Só o CEC não
              basta em algumas TVs (ex.: Philips), que entram em standby e religam
              sozinhas ao detectar o sinal do Pi; sem sinal, a TV permanece desligada.
        cec:  apenas HDMI-CEC.   hdmi: apenas o sinal HDMI.
        """
        mode = self.settings.get("tv_control", "auto")
        parts, ok_any = [], False

        if on and mode in ("auto", "hdmi"):
            hdmi_ok, hdmi_msg = self.hdmi(True)
            ok_any |= hdmi_ok
            parts.append(hdmi_msg)
        if mode in ("auto", "cec"):
            cec_ok, cec_msg = self.cec(on)
            ok_any |= cec_ok
            parts.append(cec_msg)
        if not on and mode in ("auto", "hdmi"):
            if mode == "auto":
                time.sleep(2)  # dá tempo da TV processar o standby antes de perder o sinal
            hdmi_ok, hdmi_msg = self.hdmi(False)
            ok_any |= hdmi_ok
            parts.append(hdmi_msg)

        if mode in ("auto", "cec"):
            time.sleep(1)
            power = self.cec_power_status()
            if power:
                parts.append(f"TV confirmou: {power}")

        if ok_any:
            self.tv_state = "on" if on else "off"
            self.tv_method = mode
        message = " · ".join(p for p in parts if p)
        log.info("TV %s: %s (%s)", "on" if on else "off", ok_any, message)
        return ok_any, message

    # ── Captura de tela ─────────────────────────────────────────────────────

    def cmd_screenshot(self):
        # O grim do Raspberry Pi OS pode vir sem suporte a JPEG: usa PNG como alternativa
        content_type = "image/jpeg"
        r = run(["grim", "-t", "jpeg", "-q", "70", "-s", "0.5", "-"], timeout=20, user=self.kiosk_user)
        if r.returncode != 0 or not r.stdout:
            content_type = "image/png"
            r = run(["grim", "-t", "png", "-l", "6", "-s", "0.5", "-"], timeout=20, user=self.kiosk_user)
        if r.returncode != 0 or not r.stdout:
            return False, "Falha na captura: " + r.stderr.decode(errors="replace")[:200]
        self.http(
            "POST", f"/api/v1/devices/{self.state['device_id']}/screenshot", r.stdout,
            {"Content-Type": content_type, "X-Device-Token": self.state["token"]}, timeout=30,
        )
        return True, "Captura atualizada"

    # ── Atualização do agente ───────────────────────────────────────────────

    def cmd_update_agent(self):
        updated = []
        for name in ("signflow_agent.py", "kiosk-browser.sh"):
            content = self.http("GET", f"/api/v1/agent/{name}", timeout=30)
            if name.endswith(".py"):
                compile(content, name, "exec")  # não instala código quebrado
            path = os.path.join(AGENT_DIR, name)
            tmp = f"{path}.new"
            with open(tmp, "wb") as f:
                f.write(content)
            os.chmod(tmp, 0o755)
            os.replace(tmp, path)
            updated.append(name)
        return True, "Atualizado: " + ", ".join(updated)

    # ── Telemetria ──────────────────────────────────────────────────────────

    def collect_status(self) -> dict:
        status = {
            "tv_state": self.tv_state,
            "tv_method": self.tv_method,
            "browser_running": self.browser_running(),
            "display_url": self.display_url(),
            "local_time": datetime.now().astimezone().isoformat(timespec="seconds"),
            "clock_offset_s": self.clock_offset,
        }
        try:
            with open("/sys/class/thermal/thermal_zone0/temp") as f:
                status["temp_c"] = round(int(f.read()) / 1000, 1)
        except (OSError, ValueError):
            pass
        r = run(["vcgencmd", "get_throttled"])
        if r.returncode == 0:
            # bit 0: subtensão agora, 1: freq. limitada, 2: throttling, 3: limite térmico
            # bits 16-19: o mesmo, ocorrido desde o boot
            try:
                status["throttled"] = int(r.stdout.decode().split("=")[1], 16)
            except (IndexError, ValueError):
                pass
        try:
            with open("/proc/uptime") as f:
                status["uptime_s"] = int(float(f.read().split()[0]))
            with open("/proc/loadavg") as f:
                status["load"] = float(f.read().split()[0])
            meminfo = {}
            with open("/proc/meminfo") as f:
                for line in f:
                    key, value = line.split(":", 1)
                    meminfo[key] = int(value.split()[0])
            status["mem_used_pct"] = round(100 * (1 - meminfo["MemAvailable"] / meminfo["MemTotal"]))
        except (OSError, ValueError, KeyError):
            pass
        usage = shutil.disk_usage("/")
        status["disk_used_pct"] = round(100 * usage.used / usage.total)
        if self.media_cache:
            status.update(self.media_cache.stats())
        try:
            with open("/proc/net/wireless") as f:
                for line in f.readlines()[2:]:
                    parts = line.split()
                    status["wifi_iface"] = parts[0].rstrip(":")
                    status["wifi_signal_dbm"] = int(float(parts[3]))
        except (OSError, ValueError, IndexError):
            pass
        return status

    async def send_status(self):
        status = await asyncio.to_thread(self.collect_status)
        await self.send({
            "event": "DEVICE_STATUS",
            "ip": local_ip(self.server_host),
            "hostname": socket.gethostname(),
            "agent_version": AGENT_VERSION,
            "status": status,
        })

    async def status_loop(self):
        while True:
            await self.send_status()
            await asyncio.sleep(STATUS_INTERVAL)

    # ── Agendamento (funciona offline) ──────────────────────────────────────

    def schedule_wants_on(self, now: datetime):
        schedule = self.settings.get("schedule") or {}
        if not schedule.get("enabled"):
            return None
        on, off = parse_hhmm(schedule.get("on_time")), parse_hhmm(schedule.get("off_time"))
        if not on or not off:
            return None
        days = set(schedule.get("days") or [])
        minutes = now.hour * 60 + now.minute
        on_m, off_m = on[0] * 60 + on[1], off[0] * 60 + off[1]
        if on_m < off_m:
            return now.isoweekday() in days and on_m <= minutes < off_m
        # Janela que passa da meia-noite (ex.: 18:00 → 02:00)
        if minutes >= on_m:
            return now.isoweekday() in days
        yesterday = (now - timedelta(days=1)).isoweekday()
        return minutes < off_m and yesterday in days

    async def scheduler_loop(self):
        while True:
            try:
                now = datetime.now()
                wants_on = self.schedule_wants_on(now)
                # Só age nas transições: um comando manual vale até a próxima
                if wants_on is not None and wants_on != self.last_schedule_state:
                    self.last_schedule_state = wants_on
                    log.info("Agendamento: TV %s", "ligada" if wants_on else "desligada")
                    await asyncio.to_thread(self.set_tv, wants_on)

                restart = parse_hhmm(self.settings.get("daily_restart") or "")
                today = now.date().isoformat()
                if restart and (now.hour, now.minute) == restart and self.last_daily_restart != today:
                    self.last_daily_restart = today
                    log.info("Reinício diário do navegador")
                    await asyncio.to_thread(self.restart_browser)
            except Exception:
                log.exception("Erro no agendador")
            await asyncio.sleep(SCHEDULER_INTERVAL)


def main():
    agent = Agent()
    log.info("SignFlow Agent %s — servidor %s", AGENT_VERSION, agent.server)
    asyncio.run(agent.run_forever())


if __name__ == "__main__":
    main()
