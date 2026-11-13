# Plano de refino do OpenScrcpy 1.1.7 (histórico)

> **Este documento é histórico.** Ele descreve a base React/TypeScript de 1.1.7.
> O frontend atual é Svelte 5 com runes, a versão é 2.0.0 e o prompt vigente de
> auditoria e release está em [`PROMPT-AUDITORIA-2.0.0.md`](./PROMPT-AUDITORIA-2.0.0.md).
> Não use os caminhos `*.tsx`/hooks React abaixo como referência do código atual.

Plano de execução do pacote de 9 prompts de refino sobre Tauri 2 (Rust) e React/TypeScript. Uma fase por pull request, na ordem abaixo. Cada fase começa reproduzindo o defeito, corrige a causa e fecha com teste de regressão.

## Regras de execução

1. Uma fase por branch e por PR. Não misturar refatoração de outra fase no mesmo diff.
2. Antes de corrigir, provar o defeito: teste que falha, reprodução manual documentada no PR, ou ambos.
3. Mudança de contrato IPC entra no mesmo commit dos dois lados. Backend em `src-tauri/src/commands.rs`, frontend em `src/`.
4. Dependência nova só com justificativa escrita no PR. A única prevista é `sha2`, para verificar o checksum do scrcpy.
5. Nada de `dangerouslySetInnerHTML`, `eval` ou `new Function`. Os guards de path traversal, o tratamento de mutex envenenado e os testes existentes continuam valendo.
6. Verificação obrigatória em toda fase:

```bash
npx tsc --noEmit
npm test
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

7. Se um comando já falhava antes da fase, registrar em `docs/refino/BASELINE.md` e não corrigir de carona. Exceção: falha que impede validar a própria fase.

## Estado verificado em 29/10/2026

Fatos confirmados no código, não em análise estática antiga.

| Achado | Local |
| --- | --- |
| Backend emite `download-progress`; frontend só escuta `scrcpy-status` | `commands.rs:3248`, `useDownloads.ts:55-75` |
| Timeout de adb cancela o future e deixa o filho vivo (`kill_on_drop` padrão é `false`) | `commands.rs:335`, `3614`, `3642`, `3665` |
| `stop_scrcpy` manda SIGTERM, espera 500 ms e nunca força | `commands.rs:2986-3048` |
| `teardown_sessions` usa `start_kill` depois de `taskkill`/`kill`, sem esperar | `commands.rs:3053-3077` |
| Loop de monitoramento consulta `try_wait` e remove a entrada por conta própria | `commands.rs:2319-2531` |
| `kill_adb` roda `pkill adb` e `taskkill /IM adb.exe`, matando adb de outros apps | `commands.rs:628-665` |
| `run_terminal_command` cai em `split_whitespace` quando `split_args` falha | `commands.rs:438-439` |
| `find_wlan_ipv4` retorna `None` do função inteira se `src` for o último token | `commands.rs:3691-3712` |
| `greet` ainda registrado, sem uso | `lib.rs:122` |
| `isMdnsDeviceConnected` usa `includes` (substring) | `types.ts:26-28` |
| `csp: null` e `withGlobalTauri: true` | `tauri.conf.json:29-31` |
| `shell:default` e `process:default` nas capabilities | `capabilities/default.json`, `capabilities/desktop.json` |
| Duas fontes de atualização: plugin updater e `check_app_update` | `App.tsx:141-270`, `commands.rs:3523-3570` |
| Escritas em localStorage sem `try/catch` | `usePersistedConfig.ts:73`, `93`, `100`, `107` |
| Reconnect a cada 25 s dispara um `adb_connect` por dispositivo, sem limite | `useDevices.ts:262-273` |
| Intervalo de 2 s do pareamento ignora visibilidade | `Sidebar.tsx:154-160` |
| Teste de i18n cobre uma única chave de alerta | `locales.alert-keys.test.ts` |
| CI só em Ubuntu, sem `cargo test`, sem `fmt`, sem `-D warnings` | `.github/workflows/pull_request.yml` |
| Instalação do scrcpy usa o diretório do executável, que pode não ser gravável | `commands.rs:3219-3221` |

Já está correto e não será reescrito: `Modal.tsx` tem trap de foco, restauração e Escape; `Select.tsx` cobre teclado de listbox; `LogPanel` usa memo e chaves estáveis.

## Fase 0. Baseline

Branch: `chore/refino-baseline`. Prompt: nenhum, é pré-requisito.

1. Criar a branch a partir de `main`.
2. Rodar os cinco comandos da seção de regras e anotar resultado, contagem de testes e warnings.
3. Rodar `cargo fmt` e commitar apenas formatação, se `--check` falhar.
4. Corrigir somente lint que impeça compilar ou testar. Cada correção em commit separado, explicada.
5. Criar `docs/refino/BASELINE.md` com data, versões de Node/Rust, saída resumida e lista de falhas conhecidas.

Critério de aceite: baseline reproduzível em uma máquina limpa; PR sem mudança de comportamento.

## Fase 1. Processos externos e timeout (Prompt 2)

Branch: `fix/processos-timeout`.

### Reproduzir

1. Apontar `adb` para um wrapper que dorme 30 s.
2. Chamar `adb_connect` e esperar o timeout de 5 s.
3. Verificar `pgrep -f` do wrapper: continua vivo. O future foi cancelado, o processo não.

Teste de regressão em `src-tauri/src/process.rs`, `#[cfg(unix)]`: subir `sh -c 'echo $$ > /tmp/openscrcpy-pid; sleep 30'`, estourar timeout de 100 ms, ler o PID e confirmar com `kill -0` que ele morreu.

### Mudanças

1. Criar `src-tauri/src/process.rs` e declarar `mod process;` em `lib.rs`.

```rust
use std::process::Output;
use std::time::Duration;
use tokio::process::Command;

pub async fn output_with_timeout(
    mut cmd: Command,
    limit: Duration,
) -> Result<Output, String> {
    cmd.kill_on_drop(true);
    let child = cmd.spawn().map_err(|e| e.to_string())?;
    match tokio::time::timeout(limit, child.wait_with_output()).await {
        Ok(Ok(out)) => Ok(out),
        Ok(Err(e)) => Err(e.to_string()),
        Err(_) => Err(format!("command timed out after {}s", limit.as_secs())),
    }
}
```

O `kill_on_drop(true)` garante o SIGKILL quando o future de `wait_with_output` é descartado no timeout.

2. Trocar os `timeout(..., child.wait_with_output())` por `output_with_timeout` em `adb_connect`, `adb_pair`, `adb_shell`, habilitar Wi-Fi e checagem de versão.
3. `check_scrcpy` ganha timeout de 5 s. Hoje roda `--version` sem limite e trava a tela de onboarding se o binário pendurar.
4. `kill_adb`: manter `adb kill-server` com timeout e remover `pkill adb` e `taskkill /IM adb.exe`. Matar todo adb da máquina atinge Android Studio e outros clientes. Se `kill-server` falhar, devolver erro visível em vez de sucesso mentiroso.
5. `split_args`: remover o fallback silencioso. Devolver `{ success: false, message }` com o erro de aspas.
6. `pactl_run`: usar o helper e remover o `timeout` local.

### Testes

- Timeout mata o filho (Unix).
- Timeout devolve mensagem com a duração.
- `split_args` com aspas abertas devolve erro.
- `kill_adb` não chama `pkill` (teste por inspeção seria frágil; validar manualmente com um `adb` falso no PATH e conferir que só ele recebeu `kill-server`).

### Critério de aceite

Nenhum `timeout(...wait_with_output())` solto em `commands.rs`; nenhum processo adb de terceiro é morto.

## Fase 2. Ciclo de vida da sessão (Prompt 1)

Branch: `fix/sessao-ciclo-de-vida`.

### Reproduzir

1. Iniciar uma sessão e clicar em parar.
2. Com um scrcpy que ignora SIGTERM (wrapper com `trap '' TERM`), o processo continua depois do clique. `stop_scrcpy` espera 500 ms e retorna sem forçar.
3. Iniciar duas vezes rápido para o mesmo serial: a segunda entrada sobrescreve a primeira em `processes` e o primeiro filho fica órfão.
4. Fechar o app com sessão ativa: `teardown_sessions` não espera, e o `kill` pode não concluir antes do processo pai morrer.

### Mudanças

1. Trocar `ScrcpyState.processes: Mutex<HashMap<String, Child>>` por um registro de handles.

```rust
pub struct SessionHandle {
    pub generation: u64,
    pub pid: Arc<AtomicU32>,
    pub stop: oneshot::Sender<StopRequest>,
    pub task: JoinHandle<()>,
}

pub struct StopRequest {
    pub position: Option<(i32, i32)>,
    pub reply: oneshot::Sender<()>,
}
```

`pid` começa em 0 e é preenchido após o spawn; volta a 0 quando a tarefa termina. `grab.rs:208` e `recenter_device` passam a ler o atômico em vez de `child.id()`.

2. `run_scrcpy` passa a ter uma única tarefa dona do `Child`. O loop atual de `try_wait` + leitura de stderr ganha um `tokio::select!` com o canal de stop. Ao receber stop: captura a posição final, mata com SIGTERM (Unix) ou `taskkill /PID` (Windows), espera até 2 s com `child.wait()`, e chama `start_kill()` se ainda vivo. Só então emite `scrcpy-window-pos` e responde no `reply`.

3. Remover `final_capture_hint` de `ScrcpyState`. A posição final viaja no `StopRequest`, então `stop_scrcpy` não precisa mais gravar dica para o loop ler depois.

4. `stop_scrcpy`:
   - remove o handle apenas se a geração bater;
   - captura a posição pelo `pid` antes de sinalizar;
   - envia o stop e espera `task` com timeout de 3 s;
   - se estourar, força o PID e devolve erro para a UI mostrar.

5. Geração: `bump_session_generation` continua sendo a fonte. A tarefa só remove a própria entrada se `generation` ainda for a atual. Isso elimina a corrida de stop/start descrita acima e substitui o uso separado de `session_generations` pelos sidecars de mic.

6. `teardown_sessions`: drenar handles, enviar stop para todos, esperar no máximo 3 s em conjunto e forçar os PIDs restantes. Só depois derrubar o sink de mic.

7. `grab.rs::pid_is_ours` e `recenter_device` migram para `pid.load(Ordering::Relaxed)`.

### Testes

- Duas chamadas de start para o mesmo serial deixam exatamente um handle e o PID antigo morto.
- Stop em processo que ignora SIGTERM termina em no máximo 3 s e o PID não existe mais (Unix, com wrapper `trap '' TERM`).
- Stop de device inexistente é no-op idempotente.
- Teardown com dois handles encerra os dois e não trava.
- Teste de geração: start, stop, start; a tarefa antiga não remove o handle novo.

### Critério de aceite

Nenhum `Child` guardado diretamente no estado; parar sempre encerra; nenhum órfão após fechar o app.

## Fase 3. Download do scrcpy (Prompt 3)

Branch: `fix/download-scrcpy`.

### Reproduzir

1. Abrir o onboarding em máquina sem scrcpy e iniciar o download.
2. A barra fica em 0% e o log mostra o download avançando. O evento sai como `download-progress`, mas o listener está em `scrcpy-status`.
3. Instalar o app em `/usr/bin` ou em Program Files: `current_exe().parent()` não é gravável e o download falha no meio.
4. Rodar em Linux arm64: o código escolhe `linux-x86_64` e baixa o binário errado.

### Mudanças

1. Emitir progresso no canal que o frontend já escuta:

```rust
window.emit("scrcpy-status", json!({
    "type": "download-progress",
    "percent": percent
}))
```

Remover o evento `download-progress` ou mantê-lo como alias temporário apenas se houver outro consumidor. Não há.

2. `useDownloads.ts`: adicionar guarda de reentrada em `downloadScrcpy` (`if (isDownloading) return`) e desabilitar o botão enquanto `isDownloading`.

3. Escolha de plataforma por arquitetura:

| SO / arch | Sufixo do asset |
| --- | --- |
| Linux x86_64 | `linux-x86_64` |
| Linux aarch64 | erro claro: sem build oficial, orientar pacote da distro |
| Windows x86_64 | `win64` |
| Windows aarch64 | `winarm64` |
| Windows x86 | `win32` |
| macOS x86_64 | `macos-x86_64` |
| macOS aarch64 | `macos-aarch64` |

4. Diretório de instalação:
   - preferir `current_exe().parent()/scrcpy-bin` quando gravável (modo portátil);
   - senão usar `app_data_dir()/scrcpy-bin`;
   - guardar o caminho resolvido em `OnceLock<PathBuf>` no `setup`, e fazer `get_binary_path` consultar custom, exe dir, `OnceLock` e PATH, nessa ordem.

5. Download atômico:
   - baixar para `scrcpy-bin.tmp-<pid>`;
   - extrair para `scrcpy-bin.new`;
   - validar a presença de `scrcpy` (e `adb` quando vier no pacote);
   - renomear `scrcpy-bin` para `scrcpy-bin.old`, `scrcpy-bin.new` para `scrcpy-bin`, apagar `old`;
   - em qualquer erro, restaurar `old` e limpar temporários com um guard de `Drop`.

6. Checksum: adicionar `sha2 = "0.10"` e baixar `SHA256SUMS.txt` do mesmo release. Verificar o hash do arquivo antes de extrair. Se a lista não existir ou não tiver a linha do asset, abortar com mensagem explícita. Não confiar apenas no nome do arquivo.

7. Limpar `scrcpy_temp*` e `temp_extract` no início e no fim, inclusive nos caminhos de erro.

### Testes

- `resolve_asset(os, arch)` devolve o nome esperado para as sete combinações; Linux arm64 devolve erro.
- `parse_sha256sums` encontra a linha certa e rejeita hash malformado.
- Hook `useDownloads`: evento `scrcpy-status` com `type: download-progress` atualiza `downloadProgress`; `download-complete` fecha o estado e dispara o callback.
- Teste manual: download completo em máquina sem scrcpy, com app instalado em diretório somente leitura, e upgrade por cima de uma instalação existente.

### Critério de aceite

Barra anda; instalação funciona fora do diretório do executável; arquivo corrompido é rejeitado antes da extração; nenhum temporário sobra.

## Fase 4. Superfície IPC e segurança (Prompt 4)

Branch: `fix/ipc-seguranca`.

### Reproduzir

1. `grep -n '"csp"' src-tauri/tauri.conf.json` devolve `null`.
2. No console do webview, `window.__TAURI__` existe.
3. `security.capabilities` inclui `shell:default` e `process:default`, embora o frontend não use `@tauri-apps/plugin-shell` nem reinicie o app por outro caminho além do updater.
4. Enviar `codec: "vp9"` pela UI: scrcpy não aceita VP8/VP9 em `--video-codec`, e o backend repassa sem validar.

### Mudanças

1. CSP em `tauri.conf.json`:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob: asset: http://asset.localhost;
connect-src 'self' ipc: http://ipc.localhost;
object-src 'none';
base-uri 'self';
frame-ancestors 'none'
```

`style-src` precisa de `'unsafe-inline'` por causa dos estilos inline espalhados pelos componentes e do `<style>` em `index.html`. Em `app.security.devCsp`, adicionar `http://localhost:1420 ws://localhost:1420`.

2. `withGlobalTauri: false`.

3. Capabilities: remover `shell:default` de `default.json` (o plugin Rust continua registrado para `open_app_release`). Trocar `process:default` por `process:allow-restart` em `desktop.json`.

4. Validação de entrada no backend, em um único módulo `validate.rs`:
   - `codec`: `h264`, `h265`, `av1`;
   - `audio_codec`: `auto`, `opus`, `aac`, `flac`, `raw`;
   - `mic_source`: `mic`, `voice-communication`;
   - `mic_codec`: `opus`, `aac`;
   - `rotation`: `0`, `90`, `180`, `270`;
   - `fps` e `bitrate`: faixas numéricas documentadas;
   - `device`: rejeitar serial que começa com `-`;
   - `ip` de `adb_connect`/`adb_pair`: aceitar apenas `host:porta` ou IPv4 puro, sem espaços nem flags.

5. Remover `vp8` e `vp9` das opções de `ControlPanel.tsx` (duas ocorrências, linhas 129-130 e 423-424).

6. `run_terminal_command` continua existindo porque é o console do usuário, mas:
   - nunca injeta serial que começa com `-`;
   - documenta no README que o console executa apenas `adb` e `scrcpy` resolvidos pelo app.

### Testes

- Cada allowlist aceita os valores válidos e rejeita o resto, incluindo string vazia e maiúsculas.
- Serial `-s` e IP com espaço são rejeitados.
- Teste de config: toda opção oferecida pela UI existe na allowlist (pode ser um teste que lê os arrays exportados de `src/constants` e compara com listas em `validate.rs`, via fixture JSON compartilhada).
- `npm run tauri build` abre o app com CSP ativo, fontes carregam, IPC responde.

### Critério de aceite

CSP não nulo, `__TAURI__` ausente, nenhuma permissão ampla sem uso, entradas inválidas rejeitadas antes de virar argumento de processo.

## Fase 5. Bugs pontuais de Rust (Prompt 5)

Branch: `fix/rust-bugs`.

### Mudanças

1. `find_wlan_ipv4`: trocar `tokens.get(i + 1)?` por `let Some(raw) = tokens.get(i + 1) else { continue };`. Hoje um `src` no fim da saída aborta a busca inteira em vez de tentar o próximo token.
2. Remover `commands::greet` do `generate_handler!` e a função.
3. `lib.rs`: trocar `std::env::args().next().unwrap()` por fallback sem panic no re-exec do AppImage. Se não houver `argv[0]`, seguir sem re-exec e logar.
4. Remover o comentário duplicado "Mic bridge cleanup" em `stop_scrcpy`.
5. `is_expected_asset_name`: manter; adicionar teste para nome com barra, `..` e tamanho acima de 200.
6. `get_local_scrcpy_version`: usar timeout curto e não bloquear a thread principal. hoje `Command::output()` síncrono pode pendurar a UI.
7. Revisar `unwrap()`/`expect()` em caminhos de produção com `grep -n "unwrap()" src-tauri/src`. Manter os de teste e os protegidos por invariante documentada.

### Testes

- `find_wlan_ipv4("... src")` continua procurando e encontra um `inet` anterior.
- `find_wlan_ipv4` com IPv6 e lixo devolve `None` sem panic.
- `get_local_scrcpy_version` com binário falso que dorme devolve `None` dentro do limite.

### Critério de aceite

Sem panic em entrada vazia ou saída inesperada; binário inexistente não trava a UI.

## Fase 6. Frontend: tipagem, estado e polling (Prompt 6)

Branch: `fix/frontend-estado`.

### Mudanças

1. `usePersistedConfig.ts`: envolver todas as chamadas de `localStorage` em `try/catch`. Em falha de escrita, manter o estado em memória e logar uma vez, sem quebrar o render. Criar `safeGetItem`, `safeSetItem`, `safeRemoveItem` no próprio arquivo.
2. `useDevices.ts`:
   - limite de concorrência no reconnect: um `Set<string>` de tentativas em voo; não disparar de novo para o mesmo IP;
   - backoff por IP (25 s, 50 s, 100 s, teto de 5 min) e reset ao conectar;
   - `refreshDevicesUntilSettled`: usar `AbortController` ou flag de montagem para não atualizar estado após desmontar;
   - `fetchDevicesOnce`: uma chamada em voo por vez.
3. `Sidebar.tsx`: o intervalo de 2 s do pareamento respeita `document.visibilityState` e para quando o modal fecha. Verificar a identidade de `onRefresh` nas dependências para não recriar o intervalo a cada render.
4. `useSession.ts`: erro de stop não pode ser engolido. Mostrar alerta com a mensagem do backend e manter o estado coerente.
5. `types.ts::isMdnsDeviceConnected`: comparação exata com `${name}._adb-tls-connect._tcp` e `${name}._adb-tls-connect._tcp (2)`, mais `_udp`. Nada de `includes(dev.name)`, que casa `adb-123` com `adb-1234`.
6. Tipar respostas de `invoke` que hoje são `any` nos hooks tocados. Criar interfaces em `types.ts` para `CommandResult`, `DeviceListResult` e `DownloadStatus`.

### Testes

- `localStorage.setItem` que lança não quebra o hook.
- `isMdnsDeviceConnected` rejeita prefixo parecido e aceita sufixo de conflito.
- Reconnect não dispara duas chamadas para o mesmo IP enquanto a primeira está em voo.
- Intervalo de pareamento não roda com `visibilityState === 'hidden'`.

### Critério de aceite

Nenhum `any` novo; nenhum loop de polling ilimitado; estado sobrevive a quota cheia ou storage bloqueado.

## Fase 7. Atualização do app com fonte única (Prompt 7)

Branch: `fix/updater-unico`.

### Reproduzir

1. Procurar `check_app_update` no backend e no frontend: dois caminhos, um pelo plugin updater e outro pelo comando Rust.
2. Os comentários em `App.tsx:141-149` falam de "Route 1, no updater plugin yet", o que não corresponde ao código.
3. `updater/latest.json` tem `notes` placeholder ("See the assets below for the release.").

### Mudanças

1. Fonte única: `@tauri-apps/plugin-updater` + `updater/latest.json`. Remover `check_app_update` de `commands.rs` e do `generate_handler!`.
2. `open_app_release` continua para o botão "ver no navegador".
3. `App.tsx`: apagar `checkAppUpdate` e o estado `appUpdateInfo` que só existe para o caminho antigo. Manter `handleAutoUpdate` e `openAppUpdateModal`, alimentados pelo plugin, mapeando `update.version` para `latest` e `update.body` para `notes`.
4. Revisar os comentários de `App.tsx` para descrever o fluxo real.
5. `scripts/publish-release.mjs`: gerar `notes` a partir do corpo da release, com fallback curto e honesto quando vazio. Nunca publicar o placeholder.
6. `updater/latest.json`: corrigir a entrada da versão atual e documentar no README como o manifesto é gerado.

### Testes

- Teste que lê `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `Cargo.lock` e `updater/latest.json` e exige a mesma versão.
- Teste do script de manifesto com corpo vazio e com corpo real (função exportada, sem chamar rede).
- Manual: `check()` do plugin encontra a versão, baixa, instala e relança.

### Critério de aceite

Um único caminho de checagem; nenhum comando IPC órfão; versão consistente nos cinco arquivos.

## Fase 8. Componentes, acessibilidade e i18n (Prompt 8)

Branch: `fix/componentes-a11y`.

Esta fase é auditoria primeiro. `Modal.tsx`, `Select.tsx` e `LogPanel` já têm o comportamento esperado; não reescrever.

### Mudanças

1. `ControlPanel.tsx` (725 linhas): extrair os blocos de resolução, codec, fps e rotação para componentes em `src/components/ControlPanel/`. Sem mudança de comportamento, apenas mover JSX e props tipadas.
2. Auditoria de acessibilidade nos componentes restantes:
   - todo botão só com ícone tem `aria-label`;
   - todo input tem `label` associado por `htmlFor`/`id`;
   - foco visível não é removido sem substituto;
   - modais novos usam o `Modal.tsx` existente.
3. i18n: expandir `locales.alert-keys.test.ts` para varrer todas as chaves de `alerts.*` e `logs.*` usadas via `t(` no código e exigir presença e string não vazia em todos os 8 locales. Exceção explícita para chaves que aceitam fallback.
4. Conferir que nenhum texto novo ficou hardcoded em português ou inglês nos componentes tocados.

### Testes

- Paridade de chaves nos 8 locales.
- Teste de render dos componentes extraídos.
- `npm test` sem snapshot frágil de markup inteiro.

### Critério de aceite

Nenhuma chave crua aparece na UI; navegação por teclado funciona nos fluxos principais; `ControlPanel` dividido sem regressão visual.

## Fase 9. Testes e CI (Prompt 9)

Branch: `ci/testes-matriz`.

### Mudanças

1. `.github/workflows/pull_request.yml`:
   - matriz `ubuntu-22.04`, `windows-latest`, `macos-latest`;
   - `npm ci` em vez de `npm install`;
   - `npx tsc --noEmit`, `npm test`;
   - `cargo fmt --check`;
   - `cargo clippy --all-targets -- -D warnings`;
   - `cargo test`;
   - build Tauri completo apenas em Ubuntu, para limitar custo.
2. Cache separado por SO e por `Cargo.lock`.
3. Instalar dependências de Linux só no job de Linux.
4. Teste de contrato IPC: script Node que lê `generate_handler!` em `lib.rs` e os nomes chamados em `src/`, e falha se houver comando registrado sem uso ou chamado sem registro. Ignorar `greet` depois da Fase 5.
5. Teste de versão consolidado (Fase 7) roda no CI.
6. Documentar em `docs/refino/BASELINE.md` como rodar a matriz localmente.

### Critério de aceite

CI vermelho quando `cargo test`, `fmt`, clippy ou contrato IPC quebram; verde nos três SOs no mesmo commit.

## Contratos que mudam

| Contrato | Antes | Depois | Fase |
| --- | --- | --- | --- |
| Evento de progresso | `download-progress` | `scrcpy-status` com `type: download-progress` | 3 |
| Estado de sessão | `HashMap<String, Child>` | `HashMap<String, SessionHandle>` | 2 |
| Stop de sessão | sem confirmação | `oneshot` com posição final | 2 |
| `check_app_update` | comando IPC | removido | 7 |
| `greet` | comando IPC | removido | 5 |
| CSP | `null` | política explícita | 4 |
| Permissões | `shell:default`, `process:default` | sem shell, `process:allow-restart` | 4 |

Toda mudança de contrato entra no mesmo commit dos dois lados, com o teste correspondente.

## Matriz de teste manual

Executar antes de cada release, com aparelho real e um segundo aparelho sem fio.

1. Instalar o app em diretório somente leitura, baixar o scrcpy, abrir uma sessão e gravar vídeo.
2. Iniciar e parar uma sessão cinco vezes seguidas, incluindo stop durante o pareamento.
3. Fechar o app com sessão de espelhamento e sessão de microfone ativas; conferir `pgrep scrcpy` e `pgrep adb` depois.
4. Matar o adb pelo gerenciador de tarefas e reconectar; conferir que o app não mata processos de outros apps.
5. Parear por código, fechar e reabrir o modal várias vezes; conferir que o polling para quando a janela está oculta.
6. Atualizar de 1.1.6 para 1.1.7 pelo plugin, com internet instável no meio do download.
7. Rodar em Linux x86_64, Windows x86_64 e macOS arm64.

## Definição de pronto

- As nove fases têm PR próprio, com reprodução e teste de regressão.
- Os cinco comandos de verificação passam localmente e no CI.
- Nenhum processo órfão após parar sessão ou fechar o app.
- Nenhum evento ou comando IPC sem consumidor.
- CSP ativo, `__TAURI__` indisponível, permissões mínimas.
- Versão idêntica em `package.json`, `tauri.conf.json`, `Cargo.toml`, `Cargo.lock` e `updater/latest.json`.
- `docs/refino/BASELINE.md` e este plano atualizados com o que mudou na execução.

## Fora de escopo

- Reescrever a UI ou trocar o design system.
- Migrar de Tauri 2 ou de React 19.
- Suporte a Linux arm64 por build próprio.
- Novas funcionalidades de espelhamento.
- Reescrever `Modal.tsx`, `Select.tsx` ou `LogPanel`, que já atendem.
