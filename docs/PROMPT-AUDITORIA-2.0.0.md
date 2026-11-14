# Prompt de auditoria e release — OpenScrcpy 2.0.0

> **Prompt vigente.** Substitui [`PLANO-REFINO.md`](./PLANO-REFINO.md), que foi
> escrito para a base React/TypeScript de 1.1.7. Use este documento como
> instrução de execução para uma auditoria de ponta a ponta, organização do
> código e publicação da versão 2.0.0 no GitHub.

**Repositório:** <https://github.com/Umbr-Corp/OpenScrcpy>  
**Versão-alvo:** `2.0.0`  
**Data-base:** 2026-11-13  
**Stack verificada:** Tauri 2 + Rust no backend; Svelte 5 (runes) + TypeScript +
Vite 8 + Tailwind 4 + Vitest no frontend.

---

## 1. Papel e resultado esperado

Atue como engenheiro de release e auditor de qualidade do OpenScrcpy. O trabalho
só termina quando existir, no repositório e no GitHub:

1. um relatório de auditoria com evidência por achado;
2. as correções de baixo risco aplicadas, cada uma com teste de regressão;
3. a suíte frontend, a suíte Rust, o lint e o build verdes;
4. a versão `2.0.0` consistente nos arquivos de versão;
5. o commit enviado para `main` no remoto `github`;
6. a tag e a release `v2.0.0` publicadas, com os artefatos assinados quando o
   workflow de release concluir.

Não declare uma verificação como aprovada sem ter executado o comando. Não
declare QA manual como concluído sem aparelho Android real.

---

## 2. Contexto do código atual

### 2.1 Estrutura que importa

| Área | Caminho | Observação |
| --- | --- | --- |
| Entrada Tauri | `src-tauri/src/lib.rs` | `generate_handler!` é a fonte do contrato IPC. |
| Comandos e sessões | `src-tauri/src/commands.rs` | Sessões scrcpy, adb, downloads, updater, mic. |
| Download do core | `src-tauri/src/download.rs` | Asset por OS/arch, SHA-256, extração atômica. |
| Timeout de processos | `src-tauri/src/process.rs` | `kill_on_drop` e timeout. |
| Validação de entrada | `src-tauri/src/validate.rs` | Allowlists de codec, fonte, rotação etc. |
| Store central | `src/lib/scrcpy.svelte.ts` | Dispositivos, sessão, downloads, updater (~1.070 linhas). |
| Persistência | `src/lib/storage.ts`, `src/lib/config.ts`, `src/lib/windowState.ts` | Storage defensivo e normalização de config. |
| i18n | `src/i18n/` | 8 locales, carregamento lazy, fallback inglês. |
| Componentes | `src/components/` | Svelte 5 com runes; não reintroduzir React. |
| Contrato IPC | `scripts/ipc-contract.mjs`, `scripts/__tests__/` | Falha se `invoke` e `generate_handler!` divergirem. |
| Release | `.github/workflows/release.yml` | Matriz macOS/Linux/Windows, assinatura e manifesto. |

### 2.2 Versão e atualização

- A versão precisa ser idêntica em `package.json`, `src-tauri/tauri.conf.json`,
  `src-tauri/Cargo.toml` e `src-tauri/Cargo.lock`.
  `scripts/__tests__/version-consistency.test.ts` garante isso.
- `updater/latest.json` é uma cópia local da última release publicada; o job de
  manifesto a reconstrói e envia como asset da release depois da tag. Não o
  edite à mão para "bater" com a versão.
- O endpoint do updater é
  `https://github.com/Umbr-Corp/OpenScrcpy/releases/latest/download/latest.json`.
- A release é assinada por `TAURI_SIGNING_PRIVATE_KEY` configurada no GitHub
  Actions. A chave privada nunca entra no repositório.

### 2.3 Linha de base conhecida

Antes de mexer no código, confirme estes números (a data-base é 2026-11-13):

```bash
npm ci
npm run lint          # tsc --noEmit + svelte-check
npm test              # 24 arquivos, 106 testes
npm run build         # bundle principal ~227 KB / 68 KB gzip
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml   # 63 testes
```

Se algum número divergir, registre a diferença no relatório antes de continuar.

---

## 3. Invariantes que não podem quebrar

1. **Contrato IPC:** todo `invoke('comando')` do frontend existe em
   `generate_handler!`, e todo comando registrado tem consumidor. O teste
   `scripts/ipc-contract.mjs` precisa continuar verde.
2. **Segurança Tauri:** CSP ativa, `withGlobalTauri: false`, capabilities
   mínimas, sem `shell:default` amplo.
3. **Execução de processos:** o console só executa `adb` e `scrcpy` resolvidos
   pelo app. Nenhum input vira argumento sem passar por `validate.rs`.
4. **Ciclo de vida:** stop sempre encerra a sessão; fechar o app não deixa
   scrcpy, adb ou sink de mic órfãos.
5. **Persistência:** todo acesso a `localStorage` é defensivo; storage bloqueado
   não derruba a UI.
6. **i18n:** todas as chaves usadas existem nos 8 locales e preservam
   placeholders `{var}`.
7. **Versão:** os quatro arquivos de versão permanecem iguais.
8. **Nada de regressão silenciosa:** correção sem teste de regressão não conta.

---

## 4. Fases de execução

### Fase 0 — Baseline reproduzível

1. Rodar os comandos da seção 2.3 e anotar ambiente (SO, Node, Rust, scrcpy,
   adb).
2. Registrar falhas pré-existentes em `docs/refino/BASELINE.md` ou no relatório
   novo. Não corrigir falha antiga "de carona" sem citá-la.
3. Confirmar `git status --porcelain` limpo antes de começar e revisar
   `git remote -v`.

**Aceite:** qualquer pessoa reproduz o mesmo resultado com os mesmos comandos.

### Fase 1 — Auditoria estática de ponta a ponta

Percorrer, no mínimo:

- **F01–F02 — Dispositivos:** USB, autorização, hotplug, mDNS, pareamento,
  reconexão com backoff, histórico, múltiplos aparelhos.
- **F03–F05 — Sessões:** espelho, câmera, desktop virtual, codecs, resolução,
  FPS, áudio, window position, recenter.
- **F06 — Microfone:** fonte `mic` vs `mic-voice-communication`, versão mínima do
  scrcpy, PipeWire/PulseAudio, sink, watcher, nível, Discord/OBS.
- **F07–F08 — Entrada e gravação:** HID/OTG, gravação de sessão, caminho de
  saída, erros de disco.
- **F09–F10 — Arquivos e console:** APK, drag & drop, path traversal, aspas,
  injeção de argumento, timeout.
- **F11–F12 — Core e update:** download por OS/arch, SHA-256, extração atômica,
  updater assinado, manifesto, downgrade.
- **F13–F15 — Janela, config, i18n:** geometria persistida, atalhos, migração de
  config, 8 locales, tema, a11y, RTL.
- **F16–F19 — Processos, segurança, performance, empacotamento:** órfãos,
  concorrência, CSP, capabilities, CPU/memória, AppImage/.deb/Nix.

Para cada item, produzir: reprodução, evidência, veredito (`passa`, `falha`,
`bloqueado`, `não aplicável`), severidade P0–P3 e correção proposta.

**Aceite:** nenhum achado P0/P1 fica sem issue ou correção; todo P2 tem
workaround documentado.

### Fase 2 — Contratos, segurança e consistência

1. Rodar o teste de contrato IPC e revisar `src-tauri/src/lib.rs`.
2. Revisar CSP, `withGlobalTauri`, capabilities e `validate.rs`.
3. Revisar o endpoint do updater, a assinatura e o manifesto.
4. Revisar versionamento nos quatro arquivos.
5. Procurar referências antigas de host (`forgejo`, `v16.next`) em código, docs,
   workflows e links do app.

**Aceite:** zero referência de host antiga no código de produção; updater e
links apontam para o GitHub; contrato IPC verde.

### Fase 3 — QA manual em Tauri (quando houver aparelho)

Executar com aparelho Android real e, se possível, um segundo por Wi-Fi:

1. abrir o app, onboarding e download do core;
2. espelhar, parar e reiniciar cinco vezes;
3. trocar USB → Wi-Fi;
4. iniciar e parar sessão de microfone;
5. drag & drop de APK e de arquivo comum;
6. recenter, redimensionar e reabrir a janela;
7. checar atualização do app e do core;
8. conferir `pgrep scrcpy`, `pgrep adb` e `pactl list short sinks` depois de cada
   cenário.

Se não houver aparelho, marcar a fase como **bloqueada por ambiente** e não
inventar evidência. Registrar exatamente o que faltou.

**Aceite:** checklist preenchido ou bloqueio justificado.

### Fase 4 — Correções e organização

Priorizar P1, depois P2 com workaround. Para cada correção:

1. reproduzir o defeito;
2. corrigir a causa, não o sintoma;
3. adicionar teste de regressão;
4. atualizar a documentação afetada;
5. manter o diff pequeno e reversível.

Organização permitida sem mudança de comportamento:

- remover duplicações de CSS/constantes;
- centralizar strings e acesso a storage;
- atualizar links, README, GUIDE, SECURITY e workflows;
- ampliar testes de paridade i18n;
- separar módulos só quando houver teste de contrato antes/depois.

**Não** reescrever a UI, trocar o framework, migrar Tauri ou refatorar o store
central inteiro dentro de uma release de correção.

### Fase 5 — Release 2.0.0

1. Confirmar a versão `2.0.0` nos quatro arquivos.
2. Rodar a matriz completa e o `npm run build`.
3. Commitar com mensagens convencionais.
4. Enviar para o remoto `github`:
   ```bash
   git push github main
   ```
5. Criar e enviar a tag:
   ```bash
   git tag -a v2.0.0 -m "OpenScrcpy 2.0.0"
   git push github v2.0.0
   ```
6. Acompanhar o workflow de release:
   ```bash
   gh run list -R Umbr-Corp/OpenScrcpy --workflow release.yml
   gh run watch -R Umbr-Corp/OpenScrcpy <run-id>
   ```
7. Validar a release e os assets:
   ```bash
   gh release view v2.0.0 -R Umbr-Corp/OpenScrcpy
   ```
8. Confirmar que o job de manifesto enviou `latest.json` para a release e que
   `releases/latest/download/latest.json` serve a versão 2.0.0 com URLs
   `github.com/Umbr-Corp/OpenScrcpy/releases/download/v2.0.0`.
9. Se o workflow falhar por segredo ausente ou assinatura, registrar o erro e
   **não** republicar a tag em cima de artefatos quebrados sem limpar a release.

**Aceite:** release `v2.0.0` pública, com artefatos assinados e manifesto
atualizado; `gh release view` mostra a release como latest.

---

## 5. Severidade e gate

| Nível | Critério | Gate |
| --- | --- | --- |
| P0 | Execução arbitrária, perda de dados, crash no boot, update quebrado. | Bloqueia release. |
| P1 | Feature principal inutilizável sem workaround. | Bloqueia release ou exige aceite explícito. |
| P2 | Edge case, plataforma específica, UX confusa. | Corrigir ou documentar workaround. |
| P3 | Polimento, texto, débito técnico. | Backlog. |

---

## 6. Entregáveis

1. `docs/AUDITORIA-2.0.0-2026-11-13.md` — relatório com achados, evidências,
   correções e pendências.
2. Commits pequenos, um por correção, com teste de regressão.
3. Suíte verde: `npm run lint`, `npm test`, `npm run build`, `cargo fmt`,
   `cargo clippy`, `cargo test`.
4. Release `v2.0.0` no GitHub, com artefatos e manifesto.
5. Atualização deste prompt se o processo mudar.

---

## 7. Fora de escopo

- Reescrever a UI ou trocar Svelte 5 por outro framework.
- Migrar de Tauri 2.
- Criar build próprio para Linux arm64.
- Refatorar o store central inteiro sem testes de contrato.
- Corrigir contraste/RTL ou cobertura histórica de testes como bloqueio de
  release, a menos que a auditoria os classifique como P0/P1.
- Publicar chave privada, token ou qualquer segredo no repositório.

---

## 8. Prompt curto para reutilizar

> Audite o OpenScrcpy 2.0.0 de ponta a ponta no commit atual. Use
> `docs/PROMPT-AUDITORIA-2.0.0.md` como especificação. Rode baseline, revisão
> estática, contrato IPC, segurança, i18n, ciclo de vida e empacotamento. Corrija
> apenas achados com causa raiz clara e teste de regressão, mantendo o contrato
> IPC, a CSP, as capabilities e o versionamento intactos. Registre evidência por
> achado em `docs/AUDITORIA-2.0.0-2026-11-13.md`. No fim, rode lint, testes,
> build, fmt, clippy e cargo test; envie `main` e a tag `v2.0.0` para o remoto
> `github` com `gh` autenticado e acompanhe o workflow de release até os assets
> assinados e o `latest.json` da release estarem publicados.
