# SignFlow Agent (Raspberry Pi)

Transforma um Raspberry Pi em display gerenciado pelo painel do SignFlow.

## Instalação de uma nova TV

No Pi (Raspberry Pi OS com Chromium, conectado à rede):

```bash
curl -fsSL http://10.111.4.51/api/v1/agent/install.sh | sudo bash
```

Após o reboot, a TV mostra um código de 6 caracteres. No painel, em **Dispositivos** ou **Telas**,
envie o link de uma tela para o dispositivo com esse código.

Opções: `--user NOME` (usuário do quiosque), `--enroll-key CHAVE`, `--wifi-band 2.4|5|auto`, `--no-reboot`.

> **Wi-Fi:** no teste do SENAI, o 5 GHz (canal 36) tinha 13% de perda e ~220 KB/s; fixando 2,4 GHz
> (canal 11) foram 0% de perda e ~4 MB/s. Em TVs novas, use `--wifi-band 2.4` se o 5 GHz estiver ruim.

Para voltar ao desktop padrão: `sudo bash /opt/signflow-agent/install.sh --uninstall`
(ou baixe o script e rode com `--uninstall`).

## O que o instalador faz

| Item | Detalhe |
|---|---|
| Quiosque | `signflow-kiosk.service`: cage (compositor Wayland de app único) + Chromium em `--kiosk` no tty1. O lightdm/desktop é desativado. |
| Chromium | Binário chamado direto (sem `--force-renderer-accessibility` do wrapper do Pi OS), GPU rasterization, zero-copy, políticas em `/etc/chromium/policies/managed/signflow.json`. |
| Agente | `signflow-agent.service` (root): WebSocket com o servidor, telemetria, comandos, agendamento. |
| Boot | `gpu_mem=256`, `video=HDMI-A-*:1920x1080@60` (TV 4K roda em 1080p), `consoleblank=0`. Backups em `*.signflow-bak`. |
| Wi-Fi | Economia de energia desligada (`/etc/NetworkManager/conf.d/signflow-wifi-powersave.conf`). |

## Cache local de mídia

O agente baixa vídeos, banners e logo da tela para `/var/lib/signflow-agent/media` e os serve em
`http://127.0.0.1:8090`. O telão (aberto com `?cache=...`) toca tudo do cartão SD; o Wi-Fi só é usado
para sincronizar mudanças (a cada 2 min e imediatamente quando o conteúdo muda no painel).

- Mídia ainda não baixada é transmitida do servidor (sem tela preta)
- Downloads interrompidos são retomados
- O cache espelha a playlist: ao trocar uma imagem/vídeo, o que saiu (ou foi desativado) é apagado
  na hora e só o novo é baixado; o que continua na playlist não é baixado de novo
- Limpeza a cada 6h de arquivos órfãos e downloads parciais abandonados
- Limite: 16 GB (`"cache_max_gb"` em `agent.conf`) e sempre 2 GB livres no cartão; o que não couber
  é transmitido do servidor
- Para desativar: `"media_cache": false` em `agent.conf`

## Comandos remotos (painel → Dispositivos)

Ligar/desligar TV (HDMI-CEC), reiniciar navegador, capturar tela, reiniciar o Pi, **desligar o Pi**
(só religa cortando e religando a energia), **atualizar hora** (pela internet — Google/Cloudflare —
ou, sem internet, pelo servidor SignFlow) e atualizar o agente.

## Arquivos no Pi

- `/etc/signflow-agent/agent.conf` — servidor e usuário do quiosque
- `/var/lib/signflow-agent/state.json` — id/token do dispositivo e última configuração recebida
- `/var/lib/signflow-agent/display_url` — URL aberta pelo navegador

## Diagnóstico

```bash
journalctl -u signflow-agent -f
journalctl -u signflow-kiosk -f
sudo systemctl restart signflow-kiosk
```

O agendamento de liga/desliga da TV roda no próprio Pi e continua funcionando sem o servidor.
Ele usa a hora local do Pi; o painel avisa se o relógio diferir do servidor.
