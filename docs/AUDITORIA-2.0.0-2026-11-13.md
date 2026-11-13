# Auditoria de ponta a ponta — OpenScrcpy 2.0.0

**Data:** 2026-11-13  
**Base:** `main` em `51eea0f` + correções desta auditoria  
**Escopo:** frontend Svelte 5, backend Rust/Tauri 2, contratos IPC, i18n, segurança, ciclo de vida, dependências, documentação, CI e release.  
**Método:** inspeção estática, execução da suíte, build de produção, `cargo clippy`, auditoria de dependências e revisão dos fluxos de release/updater.

---

## 1. Veredito

A base 2.0.0 está **consistente e publicável** para o que foi possível validar
neste ambiente. As verificações automatizadas fecham verdes, o build Tauri de
produção compila, a auditoria de dependências de produção está limpa e o host
do updater foi alinhado ao GitHub.

O que **não** foi validado aqui: QA manual com aparelho Android real (USB,
Wi-Fi, microfone, câmera, desktop virtual, drag & drop e updater). Essa é a
principal pendência de release e está registrada como bloqueio de ambiente, não
como aprovação implícita.

| Indicador | Resultado |
| --- | --- |
| `npm run lint` (`tsc` + `svelte-check`) | 0 erros, 0 warnings |
| Vitest | **106 testes em 24 arquivos** |
| Build de produção | ok; JS principal **225,89 KB / 67,85 KB gzip** |
| CSS | 28,39 KB / 6,13 KB gzip |
| `cargo fmt --check` | ok |
| `cargo clippy --all-targets -- -D warnings` | ok |
| `cargo test` | **63 testes** |
| `npm run tauri build -- --no-bundle` | ok |
| `npm audit --omit=dev` | **0 vulnerabilidades** |
| `npm audit` completo | 2 low (`deepmerge` transitivo, sem correção disponível) |

---

## 2. Correções aplicadas

### AUD-01 — P1 — Testes quebravam no Node 26 por causa do `localStorage`

**Problema:** Node 22.4+ define um `localStorage` experimental que fica
indisponível sem `--localstorage-file`. O ambiente jsdom do Vitest não
sobrescreve globais já existentes, então `window.localStorage` ficava
`undefined` e 18 testes falhavam com `Cannot read properties of undefined`.

**Correção:** `src/test/setup.ts` agora instala um `MemoryStorage` mínimo apenas
quando o jsdom não forneceu storage. Isso mantém o comportamento real dos
helpers defensivos em qualquer Node suportado.

**Evidência:** antes, 18 falhas em 3 arquivos; depois, 106/106 testes verdes.

### AUD-02 — P2 — Cobertura de i18n limitada a `alerts.*` e `logs.*`

**Problema:** o teste antigo não detectava chave ausente nas demais seções nem
placeholder alterado.

**Correção:** `src/i18n/locales.parity.test.ts` agora:

- varre todas as chamadas estáticas `t('...')` do código;
- inclui as chaves dinâmicas conhecidas (`common.kind*`, `header.colorModes.*`,
  `sessionBehavior.audioCodec*`, `controlPanel.<modo>`);
- exige a árvore completa do inglês nos 8 locales;
- exige string não vazia;
- compara os placeholders `{var}` de cada tradução com o inglês.

**Evidência:** 309 chaves estáticas + 16 dinâmicas; paridade completa nos 8
locales.

### AUD-03 — P3 — `alert()` nativo no ErrorBoundary

**Problema:** o fallback de erro usava `alert()` para confirmar o relatório de
diagnóstico. Isso ignora o design system, bloqueia a thread e não é acessível.

**Correção:** o nome do arquivo salvo agora aparece como texto no próprio
fallback, com a chave i18n `errorBoundary.diagnosticSavedAlert`.

### AUD-04 — P3 — CSS de scrollbar duplicado

**Problema:** dois blocos `::-webkit-scrollbar` em `src/index.css`, com o segundo
sobrescrevendo o primeiro.

**Correção:** removido o bloco duplicado; mantido o bloco temático com
`scrollbar-width` e `scrollbar-color`.

### AUD-05 — P2 — Referências de host antigo espalhadas

**Problema:** README, GUIDE, SECURITY, Header, `flake.nix`, `open_app_release` e
o fallback do updater ainda apontavam para o Forgejo; o endpoint do updater
também.

**Correção:** links de release, issues, wiki, código e endpoint do updater agora
apontam para `github.com/Umbr-Corp/OpenScrcpy` / `raw.githubusercontent.com`.
Os workflows usam a identidade `github-actions[bot]`.

**Atenção:** instalações antigas (1.1.7) continuam com o endpoint Forgejo gravado
no binário; elas só passam a usar o GitHub depois de atualizar para 2.0.0.

### AUD-06 — P3 — Texto inicial do motor hardcoded

**Problema:** `scrcpyStatus.message` nascia com `'Loading...'` fixo em inglês.

**Correção:** inicializa com `t('common.loading')`, respeitando o locale ativo.

### AUD-07 — P3 — Dependências de build na seção de runtime e vulnerabilidades

**Problema:** `postcss`, `browserslist`, `caniuse-lite` e
`@tailwindcss/postcss` estavam em `dependencies`; `npm audit --omit=dev`
reportava vulnerabilidades que não afetam o binário.

**Correção:** ferramentas de build movidas para `devDependencies`; atualizados
`postcss` 8.5.33, `browserslist` 4.29.5, `vitest` 4.1.12 e `vite` 8.3.8.
`npm audit --omit=dev` agora fecha em **0**.

### AUD-08 — P3 — Chave de persistência da janela com typo

**Problema:** a geometria da janela era salva em `opensrcpy_window_state`
(faltando o `c` de "scrcpy"). Usuários antigos tinham o estado nessa chave.

**Correção:** a chave nova é `openscrcpy_window_state`; o carregamento lê a
chave antiga uma vez, migra o valor e remove a legada. O teste cobre a migração.

### AUD-09 — P3 — Teste de storage não espionava o objeto usado

**Problema:** o teste de cota usava `vi.spyOn(Storage.prototype, 'setItem')`,
que não intercepta um storage de teste com implementação própria.

**Correção:** o spy agora é no `localStorage` usado pelo helper, provando que
`safeSetItem` engole a exceção de quota.

---

## 3. Achados abertos

### O-01 — P1 (bloqueado por ambiente) — QA manual em Tauri

Não executado nesta máquina por falta de aparelho Android conectado. Precisa ser
feito antes de considerar a release validada em campo:

- onboarding e download do core;
- espelho USB e Wi-Fi;
- stop/restart e fechamento do app sem órfãos;
- microfone (fonte `mic` e `mic-voice-communication`);
- câmera e desktop virtual;
- drag & drop de APK/arquivo;
- updater in-app;
- `pgrep scrcpy`, `pgrep adb` e `pactl` depois de cada cenário.

**Critério:** checklist preenchido com versão do Android, host e scrcpy.

### O-02 — P2 — Contraste do tema claro abaixo de WCAG AA

Tokens atuais (medidos na auditoria de 2026-11-07):

| Combinação | Contraste | AA 4,5:1 |
| --- | --- | --- |
| `--text-muted #808080` sobre `--bg-base #EEEEEE` | 3,40:1 | falha |
| `--text-muted #808080` sobre `--bg-surface #FAFAFA` | 3,78:1 | falha |
| `--text-subtle #AEAEAE` sobre `--bg-surface #FAFAFA` | 2,13:1 | falha |

**Recomendação:** escurecer `--text-muted`/`--text-subtle` no tema claro até
4,5:1 e validar com axe ou teste de contraste. Não foi alterado nesta rodada
para não mexer na identidade visual durante a release.

### O-03 — P2 — RTL árabe ainda nominal

Há 17 utilitários físicos (`ml-auto`, `left-*`, `right-*`, `pl-*`, `pr-*`,
`text-left`, `text-right`) em componentes. O locale `ar` existe e o documento
recebe `dir="rtl"`, mas o layout pode espelhar incorretamente.

**Recomendação:** migrar para utilitários lógicos (`ms-`, `me-`, `ps-`, `pe-`,
`start-`, `end-`, `text-start`) e validar com screenshots em 360/768/1200 px.

### O-04 — P3 — Store central grande

`src/lib/scrcpy.svelte.ts` tem ~1.070 linhas e concentra dispositivos, sessão,
downloads e updater. A extração de config já foi feita (`src/lib/config.ts`).

**Recomendação:** dividir por domínio com um facade `scrcpy` e testes de
contrato antes/depois. Não é bloqueio de release.

### O-05 — P3 — Cobertura histórica ainda abaixo da base React

A suíte atual tem 106 testes (era 89 antes desta auditoria; 123 na base React).
Ainda faltam cenários de reconexão/backoff, download com eventos, stop/
substituição de sessão, drag & drop e integração real com eventos Tauri.

**Recomendação:** portar esses cenários com `invoke` mockado, sem montar a UI
inteira.

### O-06 — P3 — Lint é apenas type-check

`npm run lint` executa `tsc --noEmit` e `svelte-check`, mas não há ESLint/Biome
para regras de hooks, imports ou padrões. `svelte-check` cobre acessibilidade
básica, não substitui um linter.

**Recomendação:** avaliar Biome ou ESLint flat config com regras para Svelte e
rodar no CI.

### O-07 — P3 — `deepmerge` transitivo sem correção

`npm audit` mantém 2 vulnerabilidades low em `deepmerge@4.3.1`, dependência de
`@sveltejs/vite-plugin-svelte`. Não há versão corrigida publicada; é ferramenta
de build, não runtime.

---

## 4. Evidências executadas

```bash
npm ci
npm run lint
npm test
npm run build
npm run tauri build -- --no-bundle
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
npm audit --omit=dev
```

Ambiente: Linux x86_64 (CachyOS, kernel 7.3.1), Node 26.13.0, npm 12.2.2,
Rust/Cargo 1.99.1.

---

## 5. Release

- Código e documentação enviados para `github/main`.
- Tag `v2.0.0` criada e enviada; workflow `Release CI` disparado.
- Status e assets verificados com `gh release view v2.0.0`.
- `updater/latest.json` será reescrito pelo job de manifesto com as URLs da
  release do GitHub.

> Este relatório é atualizado após o workflow concluir. Se o workflow falhar por
> segredo ou assinatura, a falha fica registrada aqui e a release não é
> considerada concluída.
