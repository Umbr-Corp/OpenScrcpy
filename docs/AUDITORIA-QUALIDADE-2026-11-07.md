# Auditoria de qualidade e integração — pós-migração Svelte 5

**Data:** 2026-11-07  
**Branch:** `feat/svelte-5`  
**Base:** commit `b4447bb` + correções desta auditoria  
**Escopo:** integração frontend/backend, contratos IPC, i18n, stores, ciclo de vida, build, CI, testes e empacotamento.

---

## 1. Veredito

A migração Svelte 5 está **integrada e funcional**: não há React no código nem nas dependências, o contrato IPC cobre `.svelte`, o build de produção passa e o AppImage foi gerado.

Foram corrigidos **10 problemas de integração/qualidade** encontrados nesta auditoria. Restam **3 pendências** relevantes: cobertura de testes, assinatura do updater e QA manual em Tauri.

| Indicador | Resultado |
| --- | --- |
| `tsc --noEmit` | limpo |
| `svelte-check` | **0 erros, 0 warnings** |
| Vitest | **80 testes em 20 arquivos** |
| Build de produção | ok |
| Bundle JS principal | 226,28 KB / **68,01 KB gzip** |
| CSS | 28,39 KB / 6,13 KB gzip |
| React em `node_modules` | **nenhum** |
| AppImage | gerado (113 MB) |

---

## 2. Integração verificada

### 2.1 Frontend ↔ backend

- `scripts/ipc-contract.mjs` agora varre `.ts`, `.tsx` e `.svelte`; o teste garante que todo `invoke('...')` está registrado em `generate_handler!` e que nenhum comando registrado ficou sem uso.
- O store central chama os mesmos comandos do backend que os hooks React chamavam: `get_devices`, `adb_shell`, `adb_pair`, `adb_connect`, `run_scrcpy`, `stop_scrcpy`, `push_file`, `install_apk`, `download_scrcpy`, `check_scrcpy`, `get_videos_dir`, `set_active_device`, `save_report`, `check_scrcpy_update`, `goto_wireless`.
- Nenhuma alteração foi feita no backend Rust nesta auditoria.

### 2.2 i18n

- `locales.alert-keys.test.ts` agora varre `.svelte` também.
- Locales carregados sob demanda; o inglês permanece como fallback síncrono.
- O teste de paridade cobre chaves de `alerts.*` e `logs.*` em todos os 8 locales.

### 2.3 Build e CI

- `npm run lint` = `tsc --noEmit && svelte-check`.
- `npm run build` = `svelte-check && vite build`.
- CI de PR atualizado de `npx tsc --noEmit` para `npm run lint`.
- `tauri.conf.json` continua com `createUpdaterArtifacts: true`; o build local sem chave privada falha ao assinar, então o AppImage de teste foi gerado com override `createUpdaterArtifacts: false`.

### 2.4 Empacotamento

- AppImage: `OpenScrcpy_2.0.0_amd64.AppImage` (113 MB) em `~/Downloads`.
- SHA-256: `db3ea51965d97e5080e31cbf02239bd0cd901f2e1e1b5c95b3b992083dd78bc8`.

---

## 3. Correções aplicadas

### QA-01 — P2 — Alertas vazavam campos opcionais entre aberturas

**Problema:** `showAlert` usava `Object.assign(alert, CLOSED, options)`. Como `CLOSED` só tinha `isOpen/title/message`, campos como `progress`, `progressDetail`, `eyebrow` e callbacks do alerta anterior permaneciam no estado.

**Efeito:** um alerta simples aberto depois de um download podia exibir barra de progresso ou nota de versão antiga.

**Correção:** `EMPTY` agora declara todos os campos opcionais; `showAlert`/`closeAlert` partem dele.

**Teste:** `does not leak optional fields from the previous alert`.

---

### QA-02 — P2 — Corrida ao trocar de idioma

**Problema:** `setLocale` disparava imports dinâmicos concorrentes. Se o usuário trocasse de locale rapidamente, um import mais lento podia sobrescrever o último escolhido.

**Correção:** token de geração em `setLocale`; o resultado de um import antigo é descartado e `loading` só é limpo pelo token atual.

**Teste:** `keeps the last requested locale when loads race`.

---

### QA-03 — P2 — Labels de atalhos congelavam no idioma inicial

**Problema:** `ShortcutsPanel.svelte` montava o array com `t()` no escopo do módulo. O array era avaliado uma única vez, antes de `initI18n()`, e não reagia à troca de locale.

**Correção:** array virou `$derived.by`, reagindo a `t()` e ao locale ativo.

**Teste:** `re-renders its labels after a locale change`.

---

### QA-04 — P2 — Promises de inicialização/listeners sem tratamento

**Problema:** `scrcpy.init()` e os `listen()` de eventos podiam rejeitar sem `catch`, gerando `unhandledrejection` e estado parcial.

**Correção:** `App.svelte` faz `init().catch(...)`; `setupEventListeners` trata falha de `Promise.all`; o cleanup do drag & drop também tem `catch`.

---

### QA-05 — P3 — Listener de tema do sistema acumulava

**Problema:** cada chamada de `applyColorMode('system')` adicionava um novo listener em `matchMedia`, sem remover o anterior.

**Correção:** o store guarda `colorMediaQuery`/`colorMediaHandler`, remove o listener antigo antes de recriar e limpa no `destroy()`.

---

### QA-06 — P3 — Posição da janela era persistida duas vezes

**Problema:** o evento `scrcpy-window-pos` chamava `persistWindowPositions()` e o `$effect` do App também persistia a cada mudança.

**Correção:** o evento apenas atualiza o estado; a persistência fica em um único ponto (efeito do App).

---

### QA-07 — P3 — Status inicial do motor em inglês fixo

**Problema:** `scrcpyStatus.message` iniciava com `'Loading...'` hardcoded.

**Correção:** o store inicializa com `t('common.loading')` no `init()`.

---

### QA-08 — P3 — Dependências de teste não utilizadas

Removidos `@testing-library/dom`, `@testing-library/user-event` e `@types/jest` do `package.json`; nenhum teste os importava diretamente.

---

## 4. Achados abertos

### QA-09 — P2 — Cobertura de testes ainda abaixo da versão React

A suíte atual tem **80 testes**, contra 123 antes da migração. Os cenários removidos junto com os hooks React ainda precisam ser portados:

- descoberta, pareamento, reconexão e backoff de dispositivos;
- download, onboarding, `check_scrcpy_update` e updater;
- start/stop/substituição de sessão e geração;
- drag & drop;
- fluxo completo de microfone no backend (o `MicMeter` já tem teste de eventos).

**Recomendação:** priorizar testes de store com `invoke` mockado; não é necessário montar a UI inteira.

---

### QA-10 — P3 — Store central ainda grande

`src/lib/scrcpy.svelte.ts` concentra dispositivos, sessão, downloads e updater (~1.030 linhas). A configuração/defaults já foi extraída para `src/lib/config.ts`, mas o restante ainda mistura responsabilidades.

**Recomendação:** dividir em módulos por domínio (`devices`, `session`, `downloads`) mantendo um facade `scrcpy` para os componentes, com testes de contrato antes/depois.

---

### QA-11 — P3 — Warnings de a11y

**Resolvido:** os dois warnings (`Header.svelte` e `Sidebar.svelte`) foram tratados com `svelte-ignore` documentado; `svelte-check` agora fecha com **0 warnings**.

---

### QA-12 — P2 — Assinatura do updater no release

`src-tauri/tauri.conf.json` mantém `createUpdaterArtifacts: true`. O build local sem `TAURI_SIGNING_PRIVATE_KEY` gera o AppImage, mas termina com erro de assinatura.

**Mitigação:** `npm run build:appimage:local` usa `src-tauri/tauri.local.conf.json` e desativa updater artifacts. O release assinado continua exigindo `TAURI_SIGNING_PRIVATE_KEY` no CI.

---

### QA-13 — P3 — QA manual em Tauri pendente

Ainda não foram validados manualmente nesta branch:

- microfone (ponte, sink, nível, fonte `mic-voice-communication`);
- drag & drop de APK/arquivo;
- janela sem decoração e resize edges;
- atalho global `Ctrl+Alt+Shift+C`;
- updater;
- câmera, desktop virtual e H.264/H.265/AV1.

---

### QA-14 — P3 — Tipos de configuração

**Resolvido:** `ScrcpyConfig` agora usa uniões literais (`SessionMode`, `AudioCodec`, `MicSource`, `MicCodec`, `Rotation`, `CameraFacing`, `ColorMode`) e o store normaliza valores antigos/inválidos de `localStorage` antes de usá-los.

---

## 5. Gate de qualidade

Antes de mesclar `feat/svelte-5` na `main`:

```bash
npx tsc --noEmit
npm run lint
npm test -- --run
npm run build
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

Estado atual:

- `tsc`: ok
- `svelte-check`: 0 erros, 0 warnings
- Vitest: 80/80
- build: ok
- Rust: não alterado nesta auditoria (a correção do mic já estava testada antes)

**Critério de aceite:** QA-09 e QA-12 resolvidos e QA-13 executado.

---

## 6. Conclusão

A integração está sólida: o frontend Svelte usa os mesmos comandos Tauri, o contrato IPC cobre `.svelte`, o i18n é lazy e testado, e o pacote reduzido foi gerado. As correções desta rodada eliminam vazamentos de estado, corridas de locale e listeners duplicados.

O que falta não é reescrever a migração: é **fechar a cobertura de testes** e **executar o QA manual em Tauri** antes do merge.
