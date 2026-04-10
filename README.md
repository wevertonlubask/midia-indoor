# SignFlow - Sistema de Midia Indoor Corporativa

Sistema completo de digital signage para exibicao de conteudo em teloes, totens e monitores em ambientes corporativos e educacionais. Desenvolvido para SENAI Santo Paschoal Crepaldi.

---

## Indice

1. [Stack Tecnologica](#stack-tecnologica)
2. [Pre-requisitos](#pre-requisitos)
3. [Instalacao Local (Desenvolvimento)](#instalacao-local-desenvolvimento)
4. [Implantacao em Producao (Servidor)](#implantacao-em-producao-servidor)
5. [Configuracao do Raspberry Pi (Display)](#configuracao-do-raspberry-pi-display)
6. [Especificacoes de Midia](#especificacoes-de-midia)
7. [Layout do Telao](#layout-do-telao)
8. [Funcionalidades](#funcionalidades)
9. [Estrutura do Projeto](#estrutura-do-projeto)
10. [Problemas Encontrados e Solucoes](#problemas-encontrados-e-solucoes)
11. [Service Worker (Cache Local)](#service-worker-cache-local)

---

## Stack Tecnologica

| Camada | Tecnologia |
|---|---|
| Backend API | FastAPI 0.115 + Python 3.12 |
| ORM | SQLAlchemy 2.0 async (asyncpg) |
| Banco de dados | PostgreSQL 16 |
| Cache / Filas | Redis 7 |
| Task Queue | Celery |
| Armazenamento | MinIO (S3-compativel) |
| Frontend | Next.js 15 (Turbopack) + React 19 + TypeScript |
| CSS | Tailwind CSS v4 |
| UI Components | shadcn/ui v4 |
| Estado server | TanStack Query v5 |
| Estado cliente | Zustand v5 |
| Tempo real | WebSocket (FastAPI nativo) + Redis Pub/Sub |

---

## Pre-requisitos

### Desenvolvimento (local)
- Docker Desktop (com Docker Compose v2)
- Python 3.12+
- Node.js 20+
- FFmpeg instalado no PATH

### Producao (servidor)
- Debian 12+ ou Ubuntu 22.04+
- Python 3.12+
- Node.js 20+
- PostgreSQL 16
- Redis 7
- MinIO
- Nginx (reverse proxy)
- FFmpeg
- systemd (gerenciamento de servicos)

### Display (Raspberry Pi)
- Raspberry Pi 4 Model B (4GB+ RAM recomendado)
- Raspberry Pi OS (Debian 13 Trixie) ou Bookworm
- Chromium Browser (instalado por padrao)
- Conexao HDMI com o telao/TV

---

## Instalacao Local (Desenvolvimento)

### 1. Clonar e configurar variaveis

```bash
git clone <repo>
cd signflow
cp .env.example .env
# Edite o .env se necessario (os padroes ja funcionam localmente)
```

### 2. Subir infraestrutura Docker

```bash
docker-compose up -d
# Aguarde todos os servicos ficarem healthy (~30s)
docker-compose ps
```

Isso sobe: PostgreSQL (porta 5433), Redis (6379), MinIO (9000/9001), Adminer (8080) e Redis Commander (8081).

### 3. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Rodar migracoes
alembic upgrade head

# Popular banco com dados iniciais
python -m app.seed

# Iniciar servidor de desenvolvimento
uvicorn app.main:app --reload --port 8000
```

### 4. Celery Worker (em outro terminal)

```bash
cd backend
source venv/bin/activate
celery -A app.tasks.celery_app worker --loglevel=info -Q default,video_transcode
```

### 5. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

### 6. URLs de Acesso Local

| Servico | URL |
|---|---|
| Admin Panel | http://localhost:3000/admin |
| Login | http://localhost:3000/auth/login |
| Display (Telao) | http://localhost:3000/display/[screen-uuid] |
| API Docs (Swagger) | http://localhost:8000/docs |
| API Docs (ReDoc) | http://localhost:8000/redoc |
| MinIO Console | http://localhost:9001 |
| Adminer (PostgreSQL) | http://localhost:8080 |
| Redis Commander | http://localhost:8081 |

> As credenciais padrao de desenvolvimento estao no arquivo `.env.example`.

---

## Implantacao em Producao (Servidor)

### 1. Preparar o servidor

```bash
# Instalar dependencias do sistema
sudo apt update && sudo apt install -y \
  python3.12 python3.12-venv python3-pip \
  nodejs npm \
  postgresql-16 redis-server \
  nginx ffmpeg git curl

# Instalar MinIO
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
sudo mv minio /usr/local/bin/
```

### 2. Configurar PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE signflow;
CREATE USER signflow WITH PASSWORD 'SUA_SENHA_AQUI';
GRANT ALL PRIVILEGES ON DATABASE signflow TO signflow;
ALTER DATABASE signflow OWNER TO signflow;
\q
```

### 3. Configurar MinIO

```bash
# Criar diretorios
sudo mkdir -p /opt/minio/data
sudo useradd -r -s /sbin/nologin minio-user
sudo chown -R minio-user:minio-user /opt/minio

# Criar arquivo de ambiente
sudo tee /etc/default/minio << 'EOF'
MINIO_ROOT_USER=SEU_USUARIO_MINIO
MINIO_ROOT_PASSWORD=SUA_SENHA_MINIO
MINIO_VOLUMES="/opt/minio/data"
MINIO_OPTS="--console-address :9001"
EOF
```

Criar servico systemd `/etc/systemd/system/signflow-minio.service`:

```ini
[Unit]
Description=MinIO Object Storage
After=network.target

[Service]
User=minio-user
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_VOLUMES $MINIO_OPTS
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable signflow-minio
sudo systemctl start signflow-minio
```

Apos iniciar, acessar `http://SERVIDOR:9001` e criar o bucket `signflow-media` com acesso publico para leitura.

### 4. Clonar o projeto

```bash
sudo mkdir -p /opt/signflow
sudo chown $USER:$USER /opt/signflow
git clone <repo> /opt/signflow
```

### 5. Configurar Backend

```bash
cd /opt/signflow/backend
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Criar arquivo `.env` em `/opt/signflow/backend/.env`:

```ini
DATABASE_URL=postgresql+asyncpg://signflow:SUA_SENHA@localhost:5432/signflow
DATABASE_URL_SYNC=postgresql://signflow:SUA_SENHA@localhost:5432/signflow
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/2
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=SEU_USUARIO_MINIO
MINIO_SECRET_KEY=SUA_SENHA_MINIO
MINIO_BUCKET=signflow-media
MINIO_SECURE=false
JWT_SECRET_KEY=CHAVE_SECRETA_GERADA_COM_openssl_rand_hex_32
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
WEATHER_LAT=-22.1256
WEATHER_LON=-51.3889
WEATHER_CITY=Presidente Prudente
CORS_ORIGINS=http://SEU_IP,http://localhost:3000
ENVIRONMENT=production
DEBUG=false
```

```bash
# Rodar migracoes
alembic upgrade head

# Popular banco com dados iniciais
python -m app.seed
```

Criar servico systemd `/etc/systemd/system/signflow-backend.service`:

```ini
[Unit]
Description=SignFlow Backend API
After=network.target postgresql.service redis.service

[Service]
User=root
WorkingDirectory=/opt/signflow/backend
Environment="PATH=/opt/signflow/backend/venv/bin:/usr/local/bin:/usr/bin"
ExecStart=/opt/signflow/backend/venv/bin/uvicorn app.main:app \
  --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Criar servico Celery `/etc/systemd/system/signflow-celery.service`:

```ini
[Unit]
Description=SignFlow Celery Worker
After=network.target redis.service

[Service]
User=root
WorkingDirectory=/opt/signflow/backend
Environment="PATH=/opt/signflow/backend/venv/bin:/usr/local/bin:/usr/bin"
ExecStart=/opt/signflow/backend/venv/bin/celery -A app.tasks.celery_app \
  worker --loglevel=info -Q default,video_transcode --concurrency=2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable signflow-backend signflow-celery
sudo systemctl start signflow-backend signflow-celery
```

### 6. Configurar Frontend

```bash
cd /opt/signflow/frontend
```

Criar arquivo `.env.local`:

```ini
NEXT_PUBLIC_API_URL=http://SEU_IP:8000
NEXT_PUBLIC_WS_URL=ws://SEU_IP:8000
NEXT_PUBLIC_MEDIA_URL=http://SEU_IP:9000/signflow-media
```

```bash
npm install
npm run build

# Copiar artefatos do standalone build
cp -r .next/standalone/* .
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
```

Criar servico systemd `/etc/systemd/system/signflow-frontend.service`:

```ini
[Unit]
Description=SignFlow Frontend
After=network.target

[Service]
User=root
WorkingDirectory=/opt/signflow/frontend
Environment="PORT=3000"
Environment="HOSTNAME=0.0.0.0"
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable signflow-frontend
sudo systemctl start signflow-frontend
```

### 7. Configurar Nginx (Reverse Proxy)

Criar arquivo `/etc/nginx/sites-available/signflow`:

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 500M;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API Backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    # MinIO media files
    location /media/ {
        proxy_pass http://127.0.0.1:9000/signflow-media/;
        proxy_set_header Host $host;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/signflow /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 8. Verificar servicos

```bash
sudo systemctl status signflow-backend signflow-celery signflow-frontend signflow-minio
```

Todos devem estar `active (running)`.

---

## Configuracao do Raspberry Pi (Display)

O Raspberry Pi 4 Model B e usado como client de exibicao. Ele acessa a URL do display via navegador Chromium em modo tela cheia.

### 1. Instalar dependencias

```bash
sudo apt update
sudo apt install -y chromium-browser unclutter xdotool
```

### 2. Aumentar memoria da GPU

O Pi 4 por padrao aloca apenas 76MB para a GPU, insuficiente para renderizar video + animacoes CSS. Aumente para 256MB:

```bash
sudo nano /boot/firmware/config.txt
```

Adicionar no final do arquivo (na secao `[all]`):

```
gpu_mem=256
```

### 3. Forcar resolucao 1080p

Se a TV for 4K, o Pi tentara renderizar em 3840x2160, o que e muito pesado para a GPU. O script de inicializacao forca 1080p automaticamente via `wlr-randr`.

### 4. Criar script de inicializacao

Criar o arquivo `~/start-display.sh`:

```bash
#!/bin/bash
# SignFlow Display - Raspberry Pi 4
DISPLAY_URL="http://IP_DO_SERVIDOR/display/SEU_SCREEN_UUID"

sleep 5

export DISPLAY=:0
export WAYLAND_DISPLAY=wayland-0
export XDG_RUNTIME_DIR=/run/user/$(id -u)

# Forcar resolucao 1080p (Pi4 nao roda 4K suavemente)
wlr-randr --output HDMI-A-2 --mode 1920x1080 2>/dev/null
sleep 2

# Desativar screensaver
xset s off 2>/dev/null
xset s noblank 2>/dev/null
xset -dpms 2>/dev/null

# Esconder cursor
unclutter -idle 0.1 -root &

# Limpar crash flags do Chromium
sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' \
  ~/.config/chromium/Default/Preferences 2>/dev/null
sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' \
  ~/.config/chromium/Default/Preferences 2>/dev/null

# Abrir Chromium
chromium \
  --start-fullscreen \
  --no-first-run \
  --noerrdialogs \
  --disable-infobars \
  --disable-translate \
  --disable-sync \
  --disable-session-crashed-bubble \
  --autoplay-policy=no-user-gesture-required \
  --disable-component-update \
  --disable-dev-shm-usage \
  --lang=pt-BR \
  "$DISPLAY_URL" &

# Aguardar Chromium abrir e forcar fullscreen via F11
sleep 8
xdotool key F11
```

```bash
chmod +x ~/start-display.sh
```

### 5. Configurar autostart

O Raspberry Pi OS com labwc (Wayland) usa o arquivo `~/.config/labwc/autostart`:

```bash
mkdir -p ~/.config/labwc
cat > ~/.config/labwc/autostart << 'EOF'
# SignFlow Display autostart
/home/SEU_USUARIO/start-display.sh &
EOF
chmod +x ~/.config/labwc/autostart
```

> **Importante:** Se o Pi usar outro compositor (LXDE, Wayfire, GNOME), o local do autostart pode variar. Verifique com `ps aux | grep -E "labwc|wayfire|gnome-shell"`.

### 6. Limpar perfil do Chromium (primeira vez)

Para evitar popups de boas-vindas, traducao e restauracao de abas:

```bash
rm -rf ~/.config/chromium
mkdir -p ~/.config/chromium/Default
touch ~/.config/chromium/"First Run"

cat > ~/.config/chromium/Default/Preferences << 'EOF'
{
  "translate":{"enabled":false},
  "browser":{"has_seen_welcome_page":true,"check_default_browser":false},
  "signin":{"allowed":false},
  "credentials_enable_service":false,
  "profile":{"exit_type":"Normal","exited_cleanly":true,"password_manager_enabled":false},
  "session":{"restore_on_startup":4,"startup_urls":[]}
}
EOF
```

### 7. Reiniciar e testar

```bash
sudo reboot
```

O Pi deve iniciar, forcar resolucao 1080p, abrir o Chromium em tela cheia e exibir o display automaticamente.

### Por que Chromium e nao Firefox?

| Aspecto | Firefox no Pi (ARM) | Chromium no Pi (ARM) |
|---|---|---|
| CSS Animations | Software rendering (CPU) | GPU compositor (hardware) |
| Video decode | Software (libavcodec) | V4L2 hardware decode |
| `transform: translate3d()` | Roda na CPU, ~15fps | Roda na GPU, 60fps |
| `will-change: transform` | Ignorado | Cria camada GPU dedicada |

O Firefox no ARM nao possui backend de aceleracao GPU funcional. Todas as animacoes CSS e decodificacao de video rodam na CPU, causando travamentos severos.

---

## Especificacoes de Midia

### Banners (coluna lateral - 22vw)

O sistema suporta 1, 2 ou 3 slots de banners empilhados verticalmente na coluna esquerda. O numero de slots e configurado por playlist (`banner_slot_count`).

| Slots | Tamanho (px) | Proporcao | Orientacao |
|-------|-------------|-----------|------------|
| 1 | 422 x 980 | ~1:2.3 | Vertical |
| 2 | 422 x 488 | ~1:1.15 | Quase quadrado |
| 3 | 422 x 324 | ~1.3:1 | Paisagem |

- **Formatos aceitos:** JPG, PNG, WebP, GIF
- **Tamanho maximo:** 10MB por arquivo
- **Transicao:** crossfade suave de 0.8s entre banners
- **Recomendacao:** usar imagens ja no tamanho correto para melhor qualidade

### Videos (area principal - ~78vw)

| Modo | Tamanho (px) | Proporcao |
|------|-------------|-----------|
| Normal (com banners ao lado) | 1498 x 980 | ~3:2 |
| Fullscreen (tela inteira) | 1920 x 1080 | 16:9 |

- **Formatos aceitos:** MP4, WebM, MOV, AVI
- **Transcodificacao automatica** via FFmpeg para H.264 MP4
- **Perfil de video:** H.264 Main Profile, Level 4.0 (compativel com hardware decode do Pi 4)
- **Slideshow:** criacao automatica de video a partir de imagens com transicoes (xfade do FFmpeg)
- Reproducao automatica e sequencial

### Logo da Empresa

- **Formatos aceitos:** JPG, PNG, WebP, GIF, SVG
- **Tamanho maximo:** 5MB
- Convertido automaticamente para WebP (max. 512px de largura)
- Exibido na barra inferior do telao, header do painel admin e tela de login

---

## Layout do Telao

```
+------------------------------------------------------+
|  +----------+  +----------------------------------+  |
|  | BANNER   |  |                                  |  |
|  | SLOT 1   |  |      VIDEO INSTITUCIONAL         |  |
|  +----------+  |      (autoplay, sem controles)   |  |
|  | BANNER   |  |      proximo video ao terminar   |  |
|  | SLOT 2   |  |                                  |  |
|  +----------+  |                                  |  |
|  | BANNER   |  |                                  |  |
|  | SLOT 3   |  |                                  |  |
|  +----------+  +----------------------------------+  |
|   22vw              ~78vw                            |
|                                                      |
|  +--------------------------------------------------+|
|  | LOGO //  TICKER: Avisos . Clima . RSS    | 14:30 ||
|  +--------------------------------------------------+|
|   Barra inferior com cor de destaque                 |
+------------------------------------------------------+
  100vw x 100vh - fullscreen, sem scroll, sem cursor
  Slots: 1, 2 ou 3 (configuravel por playlist)
```

---

## Funcionalidades

- **Multi-tela:** cada telao tem UUID unico e URL propria
- **Tempo real:** WebSocket + Redis Pub/Sub para atualizacao instantanea
- **Banners:** upload com drag-and-drop, carrossel com crossfade, 1/2/3 slots
- **Videos:** upload + transcodificacao assincrona, modo fullscreen
- **Slideshow:** criacao de videos a partir de imagens com transicoes configuraveis
- **Ticker:** texto corrido + clima + RSS configuraveis
- **Playlists:** vinculacao de conteudo por tela com controle de slots
- **Logo da empresa:** upload centralizado, exibido no telao, admin e login
- **Cor de destaque:** personalizacao da cor da barra e bordas do telao
- **Mensagem de emergencia:** broadcast via WebSocket com overlay em tela cheia
- **RSS Builder:** importacao e configuracao de feeds RSS para o ticker
- **Analytics:** log de reproducoes por conteudo/tela
- **Agendamento:** calendario visual para playlists
- **Roles:** SUPER_ADMIN, ADMIN, OPERATOR
- **Service Worker:** cache local de midia para exibicao offline parcial

---

## Estrutura do Projeto

```
signflow/
+-- backend/
|   +-- app/
|   |   +-- api/v1/          # Rotas da API REST + WebSocket
|   |   +-- core/            # Config, seguranca, banco de dados
|   |   +-- models/          # Modelos SQLAlchemy
|   |   +-- schemas/         # Schemas Pydantic v2
|   |   +-- services/        # Logica de negocio (websocket_manager)
|   |   +-- tasks/           # Tarefas Celery (video, slideshow, rss)
|   |   +-- main.py          # Ponto de entrada FastAPI
|   |   +-- seed.py          # Dados iniciais
|   +-- alembic/             # Migracoes de banco
|   +-- requirements.txt
+-- frontend/
|   +-- public/
|   |   +-- sw.js            # Service Worker (cache local)
|   +-- src/
|   |   +-- app/admin/       # Painel administrativo
|   |   +-- app/display/     # Tela de exibicao (telao)
|   |   +-- components/      # Componentes React
|   |   +-- hooks/           # Custom hooks (useWebSocket)
|   |   +-- lib/             # Utilitarios e API client
|   |   +-- store/           # Estado global Zustand
+-- raspi-setup/             # Scripts de configuracao do Raspberry Pi
+-- docker-compose.yml       # Infraestrutura local (dev)
+-- .env.example             # Variaveis de ambiente modelo
```

---

## Problemas Encontrados e Solucoes

### 1. Mensagens de emergencia nao chegavam aos teloes

**Problema:** O backend usava Uvicorn com `--workers 2`, criando dois processos separados. Cada worker tinha sua propria instancia de `websocket_manager`. Quando o POST `/emergency/` caia no Worker A, mas as conexoes WebSocket estavam no Worker B, a mensagem nao era entregue.

**Solucao:** Implementado Redis Pub/Sub no `websocket_manager.py`. Ao enviar uma mensagem de emergencia, o backend publica no canal `signflow:ws:broadcast`. Cada worker tem um subscriber que escuta esse canal e faz broadcast local para suas conexoes WebSocket.

**Arquivos alterados:**
- `backend/app/services/websocket_manager.py` - Adicionados metodos `start_subscriber()`, `stop_subscriber()`, `_subscribe_loop()`
- `backend/app/main.py` - Chamadas ao subscriber no lifespan (startup/shutdown)

### 2. RSS nao atualizava as noticias no ticker

**Problema:** Duas causas combinadas:
1. Cache de 5 minutos no endpoint `_fetch_rss_headlines` impedia que novas noticias aparecessem
2. Apos o Celery fazer scrape do RSS, nao havia notificacao para as telas atualizarem

**Solucao:**
1. Reduzido TTL do cache RSS de 5 para 2 minutos
2. Adicionada funcao `clear_rss_cache()` para invalidar cache externamente
3. Apos scrape bem-sucedido, o Celery limpa o cache e publica `TICKER_UPDATE` via Redis Pub/Sub

**Arquivos alterados:**
- `backend/app/api/v1/display.py` - Reducao do TTL e funcao `clear_rss_cache()`
- `backend/app/tasks/rss_tasks.py` - Limpeza de cache e publicacao Redis apos scrape

### 3. Display travando no Raspberry Pi 4 (videos, banners e ticker robotizados)

**Problema:** Multiplas causas de performance:

| Causa | Impacto |
|---|---|
| `backdrop-filter: blur(20px)` na barra inferior | Consome toda a GPU do Pi (VideoCore VI e fraca) |
| `textShadow` no texto animado do ticker | Forca repaint da CPU a cada frame de animacao |
| `maskImage` com gradiente no ticker | Composicao GPU pesada |
| `willChange: "contents"` no video | Valor invalido, causa overhead sem beneficio |
| `drop-shadow` filter nos icones do clima | 7 operacoes GPU extras |
| Componentes sem `memo()` | Re-renders desnecessarios a cada 60s (refetch do useQuery) |
| FFmpeg usando H.264 High Profile | Pi 4 nao decodifica High Profile via hardware |
| **Firefox como navegador** | **Sem aceleracao GPU no ARM - tudo roda na CPU** |
| GPU memory padrao de 76MB | Insuficiente para video + animacoes |
| TV 4K renderizando em 3840x2160 | 4x mais pixels que 1080p |

**Solucoes aplicadas:**

1. **Removido `backdrop-filter: blur()`** - Substituido por cor solida `rgba(15, 23, 42, 0.96)`
2. **Removidos `textShadow` e `maskImage`** do ticker - Substituidos por `contain: "layout paint"`
3. **Corrigido `willChange: "contents"`** para `translateZ(0)` apenas no VideoPlayer
4. **Removidos `drop-shadow` filters** do WeekForecast
5. **Todos os componentes do display envolvidos com `memo()`** - BannerCarousel, VideoPlayer, TickerBar, WeekForecast, ClockWidget, ConnectionIndicator
6. **BottomBar extraida como componente memoizado** separado para evitar re-renders cascata
7. **`useMemo` e `useCallback`** em arrays de dados e handlers
8. **FFmpeg alterado para H.264 Main Profile, Level 4.0** - Compativel com hardware decode do Pi 4 via V4L2
9. **Navegador trocado de Firefox para Chromium** com flags de GPU
10. **GPU memory aumentada para 256MB** via `/boot/firmware/config.txt`
11. **Resolucao forcada para 1080p** via `wlr-randr` (mesmo em TVs 4K)

**Arquivos alterados:**
- `frontend/src/components/display/TickerBar.tsx`
- `frontend/src/components/display/BannerCarousel.tsx`
- `frontend/src/components/display/VideoPlayer.tsx`
- `frontend/src/components/display/WeekForecast.tsx`
- `frontend/src/components/display/ClockWidget.tsx`
- `frontend/src/components/display/ConnectionIndicator.tsx`
- `frontend/src/app/display/[screenId]/page.tsx`
- `backend/app/tasks/slideshow_tasks.py` - Adicionado `-profile:v main -level 4.0`
- `backend/app/tasks/video_tasks.py` - Adicionado `-profile:v main -level 4.0`

### 4. Banner piscando (flash preto) na transicao

**Problema:** A transicao de banners fazia fade-out da imagem atual (opacidade 0), mostrando o fundo preto, e so depois mostrava a proxima imagem. Resultado: flash preto visivel entre cada troca.

**Solucao:** Implementado crossfade real - a imagem anterior permanece visivel por baixo enquanto a nova imagem faz fade-in por cima com transicao de 0.8s. Nenhum momento de fundo preto visivel.

**Arquivo alterado:** `frontend/src/components/display/BannerCarousel.tsx`

### 5. Chromium abrindo com popups e tela de boas-vindas

**Problema:** Ao instalar o Chromium no Pi, ele mostrava tela de primeiro uso, pedia para cadastrar conta Google, oferecia traducao de pagina e restaurava abas anteriores.

**Solucao:**
1. Perfil do Chromium limpo completamente (`rm -rf ~/.config/chromium`)
2. Flag `"First Run"` criada para pular boas-vindas
3. Preferences configuradas para desabilitar: traducao, signin, password manager, restauracao de sessao
4. Flags de linha de comando: `--no-first-run --disable-translate --disable-sync --lang=pt-BR`

### 6. Chromium abrindo em 1/4 da tela na TV 4K

**Problema:** A TV Philips 4K reportava resolucao nativa de 3840x2160. O `--window-size=1920,1080` abria o Chromium em tamanho fixo que ocupava apenas 1/4 da tela 4K.

**Solucao:** Adicionado `wlr-randr --output HDMI-A-2 --mode 1920x1080` no script de inicializacao antes de abrir o Chromium. Isso forca a saida HDMI do Pi para 1080p, que a TV escala para tela cheia. Beneficio adicional: o Pi renderiza 4x menos pixels, melhorando a performance geral.

### 7. Chromium nao abrindo em fullscreen real no labwc (Wayland)

**Problema:** A flag `--kiosk` do Chromium causava loop de foco/resize no compositor labwc (Wayland), fazendo a pagina recarregar infinitamente. A flag `--start-fullscreen` abria em janela maximizada mas nao em fullscreen real.

**Solucao:** Usar `--start-fullscreen` para abrir o Chromium, e apos 8 segundos enviar a tecla F11 via `xdotool key F11` para ativar o fullscreen nativo do Chromium. Isso funciona de forma estavel no labwc.

### 8. Autostart nao funcionando no boot do Pi

**Problema:** O Pi usava o compositor labwc (Wayland), que nao le arquivos `.desktop` do diretorio `~/.config/autostart/` (padrao XDG/GNOME).

**Solucao:** O labwc usa o arquivo `~/.config/labwc/autostart` (script shell executavel) para autostart. Criado o arquivo com chamada ao `start-display.sh &`.

### 9. Conflito de migracao do Alembic

**Problema:** Ao fazer deploy da v2.0, a tabela `alembic_version` possuia duas linhas com versoes diferentes, impedindo novas migracoes.

**Solucao:** Conectar ao PostgreSQL, deletar a linha da versao mais antiga da tabela `alembic_version`, e rodar `alembic upgrade head` novamente.

```sql
DELETE FROM alembic_version WHERE version_num = 'versao_antiga';
```

### 10. Backend crash por imports faltantes

**Problema:** O `main.py` importava modulos de `emergency` e `analytics` que nao foram enviados no deploy, causando `ImportError` no startup.

**Solucao:** Ao fazer deploy, enviar TODOS os arquivos `.py` dos diretorios `backend/app/api/v1/`, `backend/app/models/` e `backend/app/services/`, nao apenas os que foram alterados.

---

## Service Worker (Cache Local)

O display possui um Service Worker (`frontend/public/sw.js`) que implementa cache local para melhorar a performance, especialmente em dispositivos como o Raspberry Pi.

### Estrategias de cache

| Tipo de conteudo | Estrategia | Descricao |
|---|---|---|
| Midia (MinIO/S3) | Cache-First | Busca no cache local primeiro, so vai ao servidor se nao encontrar |
| API endpoints | Stale-While-Revalidate | Retorna cache imediatamente e atualiza em background |
| Assets estaticos (_next/static) | Cache-First | Arquivos JS/CSS do Next.js cacheados localmente |

### Comunicacao com o display

O Service Worker recebe mensagens do display page para:
- `INVALIDATE_API` - Limpar cache de API quando recebe update via WebSocket
- `INVALIDATE_MEDIA` - Limpar cache de midia
- `PRECACHE_MEDIA` - Pre-cachear URLs de midia (banners, videos) antes de exibir
- `CACHE_STATUS` - Reportar estado do cache

---

## Atualizacao em Producao

Para atualizar o sistema em producao apos mudancas:

### Backend

```bash
cd /opt/signflow/backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
sudo systemctl restart signflow-backend signflow-celery
```

### Frontend

```bash
cd /opt/signflow/frontend
npm install
npm run build
cp -r .next/standalone/* .
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
sudo systemctl restart signflow-frontend
```

### Verificar todos os servicos

```bash
sudo systemctl status signflow-backend signflow-celery signflow-frontend signflow-minio
```

---

## Variaveis de Ambiente

Consulte o arquivo `.env.example` na raiz do projeto para todas as variaveis disponiveis com seus valores padrao.

> **IMPORTANTE:** Nunca commitar arquivos `.env`, `.env.local` ou `.env.prod` no repositorio. Eles contem credenciais sensiveis e ja estao no `.gitignore`.

---

*SignFlow v2.0 - Weverton Lubask*
