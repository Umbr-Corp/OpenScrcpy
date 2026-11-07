# Auditoria completa do OpenScrcpy — plano de execução

**Data:** 2026-11-06  
**Base:** `main` em `0e3eb98` (versão 2.0.0 no `package.json`/`Cargo.toml`)  
**Escopo:** todas as features visíveis ao usuário + contratos com scrcpy/adb + segurança, ciclo de vida, performance, i18n e empacotamento.  
**Objetivo:** sair de "funciona na minha máquina" para uma matriz reproduzível de feature × plataforma × versão do Android × versão do scrcpy, com evidência e critério de aceite por item.

---

## 1. Resumo executivo

A investigação do microfone encontrou **um bug confirmado de contrato com o scrcpy** e **quatro causas prováveis** para o sintoma "o mic não funciona". O bug confirmado foi corrigido neste changeset; as demais causas dependem do ambiente do usuário e entram como P1/P2 no plano abaixo.

### Correção já aplicada

| ID | Severidade | Achado | Estado |
| --- | --- | --- | --- |
| MF-01 | P1 | A opção "Android: ruído limpo" enviava `--audio-source=voice-communication`. O scrcpy só aceita `mic-voice-communication` (desde a v3.1). O scrcpy encerra com `Unsupported audio source`. | **Corrigido** em `ControlPanel.tsx`, `validate.rs` e `commands.rs`, com normalização do valor antigo persistido no `localStorage` e testes de regressão. |

### Causas prováveis ainda a validar no ambiente do usuário

| ID | Severidade | Hipótese | Como confirmar |
| --- | --- | --- | --- |
| MF-02 | P1 | O app usa um `scrcpy` antigo do sistema. `check_scrcpy` só testa `--version`, não exige versão mínima. Mic existe desde a v2.1; `mic-voice-communication` desde a v3.1. | `scrcpy --version`; comparar com a versão mostrada no log do app. |
| MF-03 | P2 | No Linux, `PULSE_SINK` é ignorado pelo backend PipeWire do SDL3. O áudio do scrcpy cai no sink padrão e só chega ao mic virtual se o watcher `pactl` mover o stream. | Com a ponte ativa: `pactl list sink-inputs` e conferir o campo `Sink:` do stream `application.name = "scrcpy"`. |
| MF-04 | P2 | O watcher identifica o stream apenas por `application.name = "scrcpy"`. Com uma sessão de espelhamento já aberta, ele pode mover o stream errado (o do espelho) para o sink do mic. | Abrir espelho com áudio + ponte de mic e verificar qual stream foi movido. |
| MF-05 | P2 | Android < 12, Android 11 com tela bloqueada, toggle de microfone desligado no Android 12+, ou ROM OEM que bloqueia `RECORD_AUDIO` do shell. O app não faz pré-checagem nem mostra erro específico. | `adb shell getprop ro.build.version.sdk`; testar o comando manual da seção 3. |
| MF-06 | P2 | Em Windows/macOS a ponte não cria microfone virtual: o áudio vai para a saída padrão. A UI avisa, mas o usuário pode esperar um dispositivo de entrada. | Conferir a plataforma e o texto `micDestOther` na UI. |

> **Importante:** sem o log do app e sem `adb`/`scrcpy` no ambiente desta análise, não é possível afirmar qual das hipóteses MF-02..MF-05 é a causa do caso concreto. A seção 3 dá o roteiro de 5 minutos para separar "falha no Android/scrcpy" de "falha no roteamento Linux".

---

## 2. O que a ponte de microfone faz hoje

Fluxo real no Linux:

```text
Android (scrcpy server, AudioRecord MIC)
        │  opus/aac por USB ou Wi-Fi
        ▼
scrcpy no PC (SDL3)
        │  playback de áudio
        ▼
sink nulo "openscrcpy_mic" (PulseAudio/PipeWire)
        │  monitor do sink
        ▼
Discord/OBS/gravador (fonte de entrada)
```

Pontos frágeis do desenho:

1. O app tenta `PULSE_SINK=openscrcpy_mic` no processo do scrcpy (`commands.rs`, `spawn_scrcpy_streams`).
2. O SDL3 escolhe o backend PipeWire em sistemas PipeWire e **ignora `PULSE_SINK`** — confirmado nesta máquina com um probe SDL3: o stream nasceu no sink HDMI padrão, não no sink pedido.
3. Por isso existe o `spawn_mic_route_watcher`: a cada 0,5 s ele procura um sink-input com `application.name = "scrcpy"` e chama `pactl move-sink-input`.
4. O level meter usa `parec -d openscrcpy_mic.monitor`; ele mede o que está no sink, não necessariamente o microfone do celular.

### Consequência prática

Se o watcher não rodar, não achar o stream ou mover o stream errado, o nível pode até aparecer na UI (se o sink tiver outro áudio), mas o Discord/OBS recebe silêncio ou o áudio do espelhamento. A UI hoje não distingue "stream do mic roteado" de "outro stream scrcpy roteado".

---

## 3. Diagnóstico rápido do caso "mic não funciona"

Executar na máquina do usuário, com o celular conectado e autorizado.

### 3.1 Versões e Android

```bash
scrcpy --version
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
adb shell getprop ro.product.manufacturer
adb shell getprop ro.product.model
```

Interpretação:

- `scrcpy` < 2.1: não existe `--audio-source`; a ponte não tem como funcionar.
- `scrcpy` < 3.1: `mic-voice-communication` não existe; usar só "Phone mic (raw)".
- SDK < 30 (Android < 11): captura de áudio não suportada.
- SDK 30 (Android 11): funciona, mas a tela precisa estar desbloqueada no início da captura.
- SDK >= 31 (Android 12+): deve funcionar; se não funcionar, verificar o toggle de microfone e o OEM.

### 3.2 Teste isolado do scrcpy (sem a ponte)

Gravar 10 segundos do mic do celular direto para um arquivo:

```bash
scrcpy -s SEU_SERIAL \
  --no-window --no-video \
  --audio-source=mic \
  --audio-codec=opus \
  --no-playback \
  --record=/tmp/mic-teste.opus
```

Depois:

```bash
ffplay /tmp/mic-teste.opus
# ou
mpv /tmp/mic-teste.opus
```

- **Se o arquivo tiver voz:** o problema está no roteamento Linux do OpenScrcpy (seções 3.3/3.4).
- **Se o arquivo estiver vazio/sem áudio:** o problema está no Android, na versão do scrcpy ou na permissão de microfone. Ver o log do comando.

Repetir com a fonte com cancelamento de eco:

```bash
scrcpy -s SEU_SERIAL --no-window --no-video \
  --audio-source=mic-voice-communication --no-playback \
  --record=/tmp/mic-vc-teste.opus
```

### 3.3 Estado do áudio no Linux, com a ponte ativa

```bash
pactl info
pactl list short sinks
pactl list short sources
pactl list sink-inputs
```

Procurar:

1. O sink `openscrcpy_mic` existe.
2. A fonte `openscrcpy_mic.monitor` existe.
3. O sink-input com `application.name = "scrcpy"` aponta para o índice do `openscrcpy_mic` no campo `Sink:`.

Se o stream estiver no sink HDMI/analógico padrão, o watcher não conseguiu mover. Nesse caso, testar manualmente:

```bash
# pegar o índice do sink-input do scrcpy
pactl list short sink-inputs
# pegar o índice do sink openscrcpy_mic
pactl list short sinks
# mover (troque 123 e 45 pelos índices)
pactl move-sink-input 123 45
```

Se o `move-sink-input` funcionar, o problema é a detecção do watcher (MF-04). Se falhar, o problema é o backend de áudio/`pactl` (MF-03).

### 3.4 Prova de áudio no monitor

Com a ponte ativa e o stream já movido:

```bash
timeout 5 parec -d openscrcpy_mic.monitor \
  --format=s16le --rate=48000 --channels=1 | wc -c
```

Um valor muito baixo (perto de zero) indica silêncio. Um valor alto indica áudio chegando ao sink. Para ouvir:

```bash
timeout 5 parec -d openscrcpy_mic.monitor \
  --format=s16le --rate=48000 --channels=1 | aplay -f S16_LE -r 48000 -c 1
```

### 3.5 Seleção no Discord/OBS

O dispositivo de **entrada** é o monitor do sink, normalmente listado como:

- `Monitor of OpenScrcpy Mic` (PulseAudio clássico), ou
- `OpenScrcpy Mic` com tipo "Monitor" (PipeWire/pavucontrol).

O texto da UI fala em escolher `OpenScrcpy Mic`; se o usuário selecionar o **sink** (saída), não haverá captura. Esse ponto deve ser corrigido na UI e no guia (ver MF-07).

### 3.6 Android 12+ — toggle de microfone

No Android 12+ existe o toggle global de microfone (Quick Settings). Se estiver desligado, apps recebem silêncio e o shell também. Testar com o toggle ligado. Em algumas ROMs, o shell precisa de autorização adicional; verificar:

```bash
adb shell appops get com.android.shell RECORD_AUDIO
adb shell dumpsys package com.android.shell | grep -i RECORD_AUDIO
```

Não conceder permissões em massa sem necessidade; o resultado serve só para diagnóstico.

---

## 4. Inventário de features para a auditoria

Legenda de risco: **A** = alto (áudio, processo, segurança), **M** = médio, **B** = baixo.  
Legenda de estado: **C** = coberto por teste automatizado hoje, **P** = parcial, **N** = sem teste.

| ID | Feature | Pontos de entrada | Risco | Estado | Foco da auditoria |
| --- | --- | --- | --- | --- | --- |
| F01 | Conexão USB e autorização | `useDevices`, `get_devices`, `adb devices -l` | A | P | Estados `device`/`unauthorized`/`offline`; hotplug; serial com espaço; múltiplos aparelhos. |
| F02 | Descoberta mDNS e pareamento Wi-Fi | `get_mdns_devices`, `adb_pair`, `adb_connect`, `Sidebar` | A | P | Pareamento, reconexão, histórico, IP:porta, IPv6, duplicidade, aparelho já conectado. |
| F03 | Espelhamento (vídeo/áudio/controle) | `run_scrcpy`, `build_scrcpy_args` | A | P | Codecs, resolução, FPS, áudio, VSync, fullscreen, borderless, always-on-top, janela. |
| F04 | Modo câmera | `build_scrcpy_args`, `ControlPanel` | A | P | Lentes, facing, resolução, AR, FPS, torch, zoom, high-speed, OBS. |
| F05 | Modo desktop / display virtual | `build_scrcpy_args` (`--new-display`) | A | P | Dimensões, DPI, flex display, background, keep active, multi-monitor. |
| F06 | Ponte de microfone | `run_scrcpy`, `ensure_mic_sink`, watcher, `MicMeter` | A | P | Android 11/12+, scrcpy 2.1+, PipeWire/Pulse, sink, rota, nível, Discord/OBS, Windows/macOS. |
| F07 | HID teclado/mouse/OTG puro | `build_scrcpy_args`, `hidKeyboard`, `hidMouse`, `otgPure` | A | P | Teclado internacional, mouse relativo, OTG sem espelho, conflito com controle SDK. |
| F08 | Gravação de sessão | `build_scrcpy_args` (`--record`) | M | P | Caminho, nome, extensão, permissão, código de erro, gravação com áudio/mic. |
| F09 | Transferência e instalação de APK | `push_file`, `install_apk`, drag & drop | A | P | Path traversal, nome com espaço/UNC, APK inválido, device offline, timeout. |
| F10 | Console/terminal | `run_terminal_command`, `split_args` | A | P | Allowlist adb/scrcpy, aspas, escapes, comandos longos, saída truncada, injeção. |
| F11 | Download/checagem do core | `download_scrcpy`, `check_scrcpy`, `download.rs` | A | P | Asset por OS/arch, SHA256, extração, diretório gravável, versão mínima, retomada. |
| F12 | Atualização do app | plugin updater, `check_scrcpy_update`, `updater/latest.json` | A | P | Assinatura, manifesto, Forgejo/GitHub, falha de rede, downgrade, versão consistente. |
| F13 | Janela e atalhos | `WindowChrome`, `shortcuts`, `grab.rs`, posição persistida | M | P | Fullscreen, borderless, lembrar posição, recenter, multi-monitor, Wayland/X11/Windows. |
| F14 | Configuração e persistência | `usePersistedConfig`, localStorage | M | P | Defaults, migração de schema, storage indisponível, config antiga, reset. |
| F15 | i18n, tema e acessibilidade | `i18n`, `index.css`, modais | B | P | 8 locales, chaves órfãs, plural, foco, teclado, contraste, leitor de tela. |
| F16 | Ciclo de vida e processos | `run_scrcpy`, `stop_scrcpy`, `teardown_sessions` | A | P | Start concorrente, stop, substituição, órfãos, sink órfão, app fechando. |
| F17 | Segurança | CSP, capabilities, `validate.rs`, updater | A | P | Superfície IPC, path traversal, argument injection, segredos, permissões Tauri. |
| F18 | Performance | eventos `mic-level`, polling adb, downloads | M | P | Re-renders, CPU, memória, file descriptors, streams de log. |
| F19 | Empacotamento e plataformas | AppImage, .deb, Nix, Windows, macOS | A | P | Libs, WebKit, Wayland, assinatura, permissões, atualização. |

---

## 5. Método

### 5.1 Tipos de evidência

Cada item auditado deve produzir:

1. **Reprodução** — passos numerados, versão do app, OS, Android, scrcpy, conexão.
2. **Evidência** — log do app, saída de `adb`, `scrcpy -V debug`, `pactl`, screenshot, vídeo curto ou teste automatizado.
3. **Veredito** — `passa`, `falha`, `bloqueado`, `não aplicável`.
4. **Severidade** — P0..P3.
5. **Correção proposta** — causa raiz, mudança mínima, teste de regressão.
6. **Risco de regressão** — o que mais pode quebrar.

### 5.2 Severidade

| Nível | Critério | Gate de release |
| --- | --- | --- |
| P0 | Perda de dados, execução arbitrária, crash no boot, atualização quebrada. | Bloqueia release. |
| P1 | Feature principal inutilizável sem workaround (ex.: mic não captura, pareamento não conecta). | Bloqueia release ou exige aceite explícito. |
| P2 | Feature funciona com erro/edge case, UX confusa, plataforma específica. | Corrigir na janela ou documentar workaround. |
| P3 | Polimento, texto, consistência, débito técnico. | Backlog. |

### 5.3 Matriz mínima de execução

| Eixo | Valores |
| --- | --- |
| Host | Linux X11, Linux Wayland, Windows 10/11, macOS Intel, macOS Apple Silicon |
| Android | 11, 12, 13, 14, 15, 16 (mínimo: um aparelho por faixa 11/12+/14+) |
| Conexão | USB, Wi-Fi pareado, Wi-Fi mDNS, aparelho não autorizado, aparelho offline |
| scrcpy | Versão mínima suportada, versão baixada pelo app, última release |
| Sessão | espelho, câmera, desktop, mic, espelho + mic simultâneos |
| Áudio host | PipeWire, PulseAudio clássico, ALSA puro (sem `pactl`) |

Não é necessário rodar todas as combinações para cada feature; a matriz define o **mínimo obrigatório** e os casos de risco.

---

## 6. Fases da auditoria

### Fase 0 — Baseline e inventário (1 dia)

- Rodar `npx tsc --noEmit`, `npm test`, `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`.
- Registrar versões de Node, Rust, scrcpy, adb, OS e Android usados.
- Congelar a lista de features e donos.
- Criar `docs/auditorias/2026-11-06/BASELINE.md` com falhas pré-existentes.
- **Aceite:** baseline reproduzível; nenhuma falha antiga é confundida com regressão nova.

### Fase 1 — Contratos com scrcpy e adb (3 dias) — prioridade máxima

Objetivo: garantir que o app só envia opções/valores que a versão instalada entende.

- Extrair todas as flags de `build_scrcpy_args` e comparar com o `--help` da versão mínima, da versão baixada e da última.
- Validar valores: codecs, fontes de áudio, orientação, câmera, display, render driver, background.
- Implementar **versão mínima** para cada modo:
  - espelho: versão base;
  - câmera: scrcpy com `--video-source=camera` (v2.0+);
  - desktop: `--new-display` (v4.0+);
  - mic: `--audio-source=mic` (v2.1+);
  - mic com voz: `mic-voice-communication` (v3.1+).
- Se a versão não atender, a UI deve desabilitar o modo ou mostrar erro claro antes de iniciar, não deixar o scrcpy morrer.
- Adicionar teste de regressão para o bug MF-01 e para a matriz de versões.
- **Aceite:** nenhuma opção inválida chega ao processo; mensagem de erro contém versão exigida e versão encontrada.

### Fase 2 — Modos de sessão (5 dias)

Para cada modo (F03–F08), testar:

- Início, funcionamento, parada e reinício.
- Áudio/vídeo/controle e combinações.
- Gravação e caminho de saída.
- Logs de erro e estado da UI.
- Comportamento com aparelho desconectado no meio.
- **Aceite:** cada modo tem checklist preenchido e evidência em pelo menos 2 hosts e 2 versões de Android.

### Fase 3 — Dispositivos e conectividade (3 dias)

F01/F02:

- USB: autorização, replug, múltiplos aparelhos, serial com espaço.
- Wi-Fi: pareamento, reconexão, histórico, IP:porta, IPv6, mDNS duplicado.
- Estados `unauthorized`, `offline`, `authorizing`, `unknown`.
- `kill_adb` não pode matar adb de terceiros.
- Polling: intervalo, cancelamento, timeout, memória.
- **Aceite:** matriz de conexão preenchida; nenhum processo órfão; nenhum adb de terceiro morto.

### Fase 4 — Arquivos, terminal, downloads e updates (3 dias)

F09–F12:

- Path traversal (`../`, absoluto, UNC, nome com espaço, unicode).
- APK inválido, arquivo grande, device offline, timeout.
- Console: aspas, escapes, comandos encadeados, allowlist, saída truncada.
- Download: asset correto por OS/arch, SHA256, extração atômica, diretório somente leitura, retomada.
- Updater: assinatura, manifesto, falha de rede, versão igual/maior/menor.
- **Aceite:** nenhum caminho escapa do destino; nenhuma atualização sem assinatura; falha de rede não corrompe a instalação.

### Fase 5 — Ciclo de vida, concorrência e limpeza (3 dias)

F16:

- Duplo clique em iniciar; iniciar/parar rápido; substituir sessão; fechar o app com sessão ativa.
- Verificar `pgrep scrcpy`, `pgrep adb`, `pactl list short sinks` depois de cada cenário.
- Sink de mic: criar, reutilizar, descarregar, crash, app fechando, duas sessões.
- Timeouts de stop e force-kill.
- **Aceite:** nenhum processo/sink órfão; estado da UI sempre converge para o estado real.

### Fase 6 — UX, i18n e acessibilidade (2 dias)

F13–F15:

- Navegação por teclado, foco em modais, Escape, leitor de tela.
- Contraste, tamanho de alvo, estados de loading/erro.
- 8 locales: chaves faltantes, texto truncado, plural, números/unidades.
- Tema claro/escuro/sistema.
- **Aceite:** nenhuma string hardcoded; foco não escapa de modal; fluxo principal operável só com teclado.

### Fase 7 — Segurança, performance e plataformas (3 dias)

F17–F19:

- Revisar CSP, capabilities, comandos IPC, validação de entrada, path traversal, argument injection.
- Medir CPU/memória com espelho + mic + logs; verificar re-renders do `mic-level`.
- AppImage/.deb/Nix; Wayland/X11; Windows/macOS.
- **Aceite:** nenhum P0/P1 de segurança; performance dentro do orçamento definido (ex.: < 5% CPU idle, sem crescimento de memória em 1 h).

### Fase 8 — Correções e regressão final (2 dias)

- Priorizar P0/P1, depois P2 com workaround.
- Cada correção entra com teste de regressão.
- Rodar a matriz mínima novamente.
- Publicar relatório final com veredito por feature.
- **Aceite:** relatório assinado; P0/P1 fechados ou aceitos formalmente; suíte verde.

**Esforço total estimado:** 22–25 dias de uma pessoa; as fases 2, 3 e 4 podem rodar em paralelo com 2–3 auditores.

---

## 7. Checklists por feature

### F01 — Conexão USB

- [ ] Aparelho autorizado aparece em até 2 s.
- [ ] Aparelho não autorizado aparece como indisponível, com instrução.
- [ ] Aparelho offline não é confundido com disponível.
- [ ] Replug/desplug atualiza a lista sem duplicar.
- [ ] Dois aparelhos simultâneos: seleção e sessão no aparelho correto.
- [ ] `adb devices -l` com serial contendo espaço/unicode é parseado.

### F02 — Wi-Fi / mDNS / pareamento

- [ ] Pareamento com código funciona em Android 11+.
- [ ] Reconexão após reiniciar o app usa o histórico.
- [ ] mDNS não duplica aparelho já conectado.
- [ ] IPv6 entre colchetes é aceito.
- [ ] IP:porta inválido retorna erro claro.
- [ ] `adb connect` repetido não cria sessões concorrentes.

### F03 — Espelhamento

- [ ] H.264/H.265/AV1 conforme suporte do aparelho.
- [ ] Áudio ligado/desligado; codec auto/opus/aac/flac/raw.
- [ ] Resolução original/limitada; FPS 30/60/120.
- [ ] VSync on/off; fullscreen; borderless; always-on-top.
- [ ] Janela restaurada na posição correta; recenter funciona.
- [ ] Controle por teclado/mouse; atalhos do scrcpy.

### F04 — Câmera

- [ ] Listar lentes; selecionar ID/facing.
- [ ] Resolução segura; AR; FPS; high-speed.
- [ ] Torch e zoom (v4+).
- [ ] Câmera ocupada por outro app retorna erro claro.
- [ ] OBS reconhece a janela; virtual camera funciona.

### F05 — Desktop / display virtual

- [ ] `--new-display` com largura/altura/DPI.
- [ ] Flex display redimensiona sem crash.
- [ ] Background color válido/inválido.
- [ ] Keep active.
- [ ] Aparelho sem suporte a display virtual retorna erro claro.

### F06 — Microfone

- [ ] Android 12+ com fonte `mic` captura voz.
- [ ] Android 12+ com `mic-voice-communication` captura voz com AEC/AGC.
- [ ] Android 11 desbloqueado captura; bloqueado retorna erro claro.
- [ ] Android 10 ou menor retorna erro claro (não suportado).
- [ ] Toggle de mic desligado no Android 12+ retorna silêncio/erro detectável.
- [ ] scrcpy 2.1+ para `mic`; 3.1+ para `mic-voice-communication`; versão antiga é bloqueada com mensagem.
- [ ] Linux PipeWire: stream do scrcpy é movido para `openscrcpy_mic`.
- [ ] Linux PulseAudio clássico: `PULSE_SINK` funciona ou watcher move.
- [ ] Sem `pactl`: erro visível, áudio não vai para o mic virtual.
- [ ] Sem `parec`: nível indisponível, captura continua.
- [ ] Sink pré-existente é reutilizado; sink órfão é limpo.
- [ ] Duas sessões scrcpy: só o stream do mic é movido.
- [ ] Parar a ponte remove o sink e libera a fonte.
- [ ] Fechar o app remove o sink e mata o scrcpy.
- [ ] Discord/OBS listam o monitor como entrada e capturam voz.
- [ ] Windows/macOS: comportamento documentado (saída padrão, sem mic virtual).
- [ ] Nível do mic corresponde ao áudio real; silêncio não mostra nível falso.

### F07 — HID / OTG

- [ ] Teclado HID com layout internacional/acentos.
- [ ] Mouse HID relativo e absoluto.
- [ ] OTG puro sem espelho.
- [ ] Conflito HID + controle SDK.
- [ ] Desconexão USB durante OTG.
- [ ] Windows/macOS/Linux.

### F08 — Gravação

- [ ] Caminho padrão e customizado.
- [ ] Nome seguro; extensão correta.
- [ ] Áudio + vídeo; só áudio; só vídeo.
- [ ] Disco cheio/sem permissão: erro claro, sem arquivo corrompido.
- [ ] Parar sessão finaliza o arquivo.

### F09 — Arquivos/APK

- [ ] Drag & drop de APK instala.
- [ ] Drag & drop de arquivo comum envia para `/sdcard/Download/`.
- [ ] Nome com espaço, unicode, `../`, path absoluto.
- [ ] APK inválido/assinatura inválida.
- [ ] Device offline/timeout.
- [ ] Progresso e erro na UI.

### F10 — Console

- [ ] Apenas `adb` e `scrcpy` resolvidos pelo app.
- [ ] Aspas simples/duplas, escapes, UNC.
- [ ] Comando com pipe/redirecionamento não executa shell.
- [ ] Saída truncada em limite seguro.
- [ ] Timeout e cancelamento.

### F11 — Download do core

- [ ] Asset correto para Linux/Windows/macOS e x86_64/aarch64.
- [ ] SHA256 confere; hash inválido aborta.
- [ ] Extração não permite path traversal.
- [ ] Diretório somente leitura cai para app data.
- [ ] Download interrompido não deixa instalação parcial.
- [ ] Versão mínima checada após instalar.

### F12 — Atualização do app

- [ ] Manifesto `updater/latest.json` válido.
- [ ] Assinatura verificada.
- [ ] Falha de rede não quebra o app.
- [ ] Versão igual/maior/menor não faz downgrade indevido.
- [ ] Versões consistentes em `package.json`, `Cargo.toml`, `tauri.conf.json`, `Cargo.lock`.

### F13 — Janela/atalhos

- [ ] Posição lembrada por dispositivo.
- [ ] Recenter com atalho global.
- [ ] Fullscreen/borderless.
- [ ] Multi-monitor com coordenadas negativas.
- [ ] Wayland/X11/Windows/macOS.

### F14 — Persistência

- [ ] Defaults corretos no primeiro boot.
- [ ] Config antiga migra sem quebrar (inclui `voice-communication` → `mic-voice-communication`).
- [ ] localStorage indisponível não derruba a UI.
- [ ] Reset de config.

### F15 — i18n/tema/acessibilidade

- [ ] 8 locales com paridade de chaves.
- [ ] Nenhuma string hardcoded em componente.
- [ ] Foco preso em modal; Escape fecha.
- [ ] Contraste AA; alvos >= 24 px.
- [ ] Tema claro/escuro/sistema.

### F16 — Ciclo de vida

- [ ] Start duplo não cria dois processos.
- [ ] Stop sempre encerra (inclusive SIGTERM ignorado).
- [ ] Substituição de sessão remove a antiga.
- [ ] Fechar o app não deixa scrcpy/adb/sink.
- [ ] Sessão de mic substituída não deixa watcher/level meter rodando.

### F17 — Segurança

- [ ] CSP restritiva; `withGlobalTauri=false`.
- [ ] Capabilities mínimas.
- [ ] Validação de todo input que vira argumento.
- [ ] Sem `dangerouslySetInnerHTML`/`eval`.
- [ ] Updater assinado; download com checksum.
- [ ] Logs não vazam segredos.

### F18 — Performance

- [ ] `mic-level` não re-renderiza a árvore inteira.
- [ ] Polling adb não acumula intervals.
- [ ] Logs não crescem sem limite.
- [ ] CPU/memória estáveis em sessão longa.
- [ ] Muitos dispositivos não degradam a UI.

### F19 — Plataformas/empacotamento

- [ ] AppImage abre em Fedora/Ubuntu/Wayland.
- [ ] .deb instala e remove limpo.
- [ ] Nix flake builda.
- [ ] Windows/macOS assinatura/notarização.
- [ ] Libs do scrcpy presentes no bundle.

---

## 8. Deep dive do microfone — casos de teste

| Caso | Cenário | Esperado | Evidência |
| --- | --- | --- | --- |
| M01 | Android 14, USB, fonte `mic` | Voz no monitor | arquivo + `pactl` |
| M02 | Android 14, USB, fonte `mic-voice-communication` | Voz com AEC/AGC | arquivo + log |
| M03 | Android 11 desbloqueado, fonte `mic` | Voz | arquivo |
| M04 | Android 11 bloqueado no start | Erro claro do scrcpy | log |
| M05 | Android 10 | Erro "não suportado" | log/UI |
| M06 | Toggle de mic off | Silêncio detectável/erro | log/UI |
| M07 | scrcpy 2.0 | Bloqueio com versão mínima | UI |
| M08 | scrcpy 3.0 + fonte voz | Bloqueio com versão mínima | UI |
| M09 | PipeWire, `PULSE_SINK` ignorado | Watcher move stream | `pactl list sink-inputs` |
| M10 | PulseAudio clássico | `PULSE_SINK` ou watcher move | `pactl` |
| M11 | Sem `pactl` | Erro claro, sem mic virtual | log |
| M12 | Sem `parec` | Captura funciona, nível indisponível | log |
| M13 | Sink já existe | Reutiliza sem duplicar | `pactl` |
| M14 | Duas sessões (espelho + mic) | Só stream do mic é movido | `pactl` |
| M15 | Stop da ponte | Sink removido | `pactl` |
| M16 | Fechar o app | Sink e scrcpy mortos | `pgrep`, `pactl` |
| M17 | Discord/OBS | Monitor aparece como entrada e captura | screenshot |
| M18 | Windows | Saída padrão, sem mic virtual | UI/log |
| M19 | macOS | Saída padrão, sem mic virtual | UI/log |
| M20 | RNNoise indisponível | Fallback para sink simples | log |

---

## 9. Entregáveis

1. `docs/auditorias/2026-11-06/BASELINE.md` — ambiente, comandos, falhas pré-existentes.
2. `docs/auditorias/2026-11-06/RELATORIO.md` — veredito por feature (F01–F19).
3. `docs/auditorias/2026-11-06/EVIDENCIAS/` — logs, screenshots, arquivos de áudio, saídas de `pactl`.
4. Uma issue por falha P0/P1/P2, com repro, evidência, severidade e correção proposta.
5. PRs pequenos, um por correção, com teste de regressão.
6. Atualização do `GUIDE.md` com o passo a passo do mic (incluindo "Monitor of OpenScrcpy Mic").
7. Checklist final assinado com o gate de release.

---

## 10. Critério de conclusão

A auditoria termina quando:

- Todas as features F01–F19 têm veredito e evidência.
- Nenhum P0/P1 aberto sem aceite formal.
- Cada correção tem teste de regressão verde.
- A matriz mínima (Linux X11, Linux Wayland, Windows, macOS; Android 11/12+/14+; USB/Wi-Fi; scrcpy mínimo/atual) foi executada ou teve bloqueio justificado.
- O relatório final responde, para cada feature: **funciona, em quais condições, e o que acontece quando falha**.

---

## 11. Observações sobre o caso concreto do microfone

Para fechar o diagnóstico do usuário, são necessários:

1. Saída de `scrcpy --version`.
2. Versão do Android (`ro.build.version.sdk`).
3. Plataforma do host (Linux/Windows/macOS) e, no Linux, se é PipeWire ou PulseAudio.
4. Log do app ao iniciar a ponte (as linhas `[SYSTEM]` e `[MIC]`).
5. Saída de `pactl list sink-inputs` com a ponte ativa.

Com esses cinco itens é possível dizer se o problema é:

- **Android/scrcpy** (versão, permissão, versão do Android), ou
- **Roteamento Linux** (sink, watcher, `PULSE_SINK`), ou
- **Seleção do dispositivo no app de destino** (monitor vs. sink).

A correção MF-01 já remove uma falha certa do caminho "Android: ruído limpo". Se o usuário estiver usando a fonte "Phone mic (raw)" e o problema persistir, a causa mais provável é MF-02 ou MF-03 — e o roteiro da seção 3 separa as duas.
