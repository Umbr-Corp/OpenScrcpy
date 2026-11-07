# Auditoria de Frontend — OpenScrcpy

**Data:** 2026-11-07  
**Base:** `main` em `0e3eb98` + correção de microfone deste changeset  
**Escopo:** React/TypeScript/Tailwind/Tauri, componentes, hooks, i18n, acessibilidade, performance, build e avaliação de frameworks alternativos.  
**Método:** inspeção estática do código, build de produção, execução de `tsc` e da suíte Vitest, comparação com documentação oficial e dados públicos de ecossistema.

---

## 1. Veredito executivo

O frontend **não tem um problema de framework**. A stack atual é adequada para o produto:

- React 19.2.5 + Vite 8 + TypeScript 6 + Tailwind 4 + Tauri 2.
- `npx tsc --noEmit` passou sem erros.
- `npm test` passou: **123 testes em 24 arquivos**.
- Build de produção passou; bundle principal **465 KB minificado / 136,9 KB gzip**.
- A documentação do Tauri recomenda Vite justamente para React, Vue, Svelte e Solid em SPAs.
- O Estado do JavaScript 2025 mostra React ainda dominante em uso; Solid lidera satisfação há cinco anos, mas com adoção bem menor.

**Recomendação:** manter React e investir em qualidade (lint, React Compiler, i18n sob demanda, acessibilidade e correções pontuais). Migrar para Svelte 5 ou Solid só se houver uma reescrita planejada por outro motivo — o ganho de performance não paga o custo de regressão hoje.

Nenhum achado **P1** foi confirmado na revisão estática. Os achados abaixo são P2/P3.

---

## 2. Baseline medido

### 2.1 Tamanho e estrutura

| Métrica | Valor |
| --- | --- |
| Linhas de frontend em `src/` | ~4.804 |
| Componentes `.tsx` | 19 componentes principais |
| Hooks de estado | 5 hooks em `src/hooks/scrcpy/` |
| Arquivos de teste | 24 |
| Testes | 123 |
| Bundle JS | 465,32 KB / **136,90 KB gzip** |
| Bundle CSS | 27,71 KB / **6,04 KB gzip** |
| Módulos transformados | 1.756 |
| Locales | 8 bundles, ~184 KB de fonte, todos importados eagerly |

Maiores arquivos:

- `Sidebar.tsx` — 641 linhas
- `App.tsx` — 601 linhas
- `useDevices.ts` — 426 linhas
- `Header.tsx` — 406 linhas
- `useSession.ts` — 271 linhas

### 2.2 Verificações executadas

```bash
npx tsc --noEmit          # limpo
npm test -- --run         # 123 passed (24 files)
npm run build             # ok, com 1 warning de dynamic import
```

O teste foi executado com **Node 24.22.2 LTS**. O Node 26.13 falhou em testes que usam `localStorage` por causa do comportamento experimental de `--localstorage-file` do Node 26, não por defeito do app. O CI do projeto usa Node 20.

---

## 3. Achados

### FE-01 — P2 — Não existe lint de frontend; só `tsc`

**Evidência:** `package.json` tem `lint: "tsc --noEmit"` e não há ESLint/Biome/Prettier configurado. O CI roda `tsc` e `npm test`, mas nenhum lint de hooks ou de padrões React.

**Impacto:** erros de `useEffect`/dependências, `setState` em render, acessibilidade e imports não são detectados. O código já tem `eslint-disable-next-line react-hooks/exhaustive-deps` em `App.tsx` sem um ESLint instalado, o que mostra que a proteção esperada não existe.

**Correção:** adicionar ESLint 9 flat config com `eslint-plugin-react-hooks` (preset `recommended`, que inclui as regras do React Compiler) e `eslint-plugin-jsx-a11y`; rodar no CI. Alternativa: Biome para formatação/regras gerais + ESLint apenas para hooks.

**Aceite:** `npm run lint` falha em dependências de effect ausentes e em violações de regras de hooks; CI executa.

---

### FE-02 — P2 — React Compiler não está habilitado e a memoização manual é ineficaz

**Evidência:**

- Não há `babel-plugin-react-compiler` no projeto.
- Há apenas **um** `memo()` (`LogPanel`) e **quatro** `useMemo` em todo o `src/`.
- `LogPanel` é `memo`, mas recebe `onClear`, `onAddLog` e `onRunCommand` recriados a cada render em `App.tsx` (`useLogs` e `useSession` recriam as funções). A comparação de props nunca empata.
- O App re-renderiza em cada mudança de `logs`, `config`, `runningDevices`, etc.; os painéis laterais não são memoizados.

**Impacto:** trabalho de render desnecessário, especialmente com logs e polling de dispositivos. O `mic-level` já foi isolado no `MicMeter`, então o pior caso antigo foi resolvido; o restante é moderado.

**Correção:** habilitar o React Compiler 1.0 (estável desde 2025-10) via plugin do Vite, em uma branch separada, medindo antes/depois. O compilador faz memoização automática e cobre casos que `useMemo`/`useCallback` não cobrem. Manter o `memo` existente durante a transição.

**Aceite:** build com compiler sem warnings; orçamento de re-render medido com React DevTools Profiler antes/depois; nenhuma regressão nos 123 testes.

---

### FE-03 — P2 — Todos os 8 locales entram no bundle inicial

**Evidência:** `src/i18n/index.tsx` importa estaticamente `en`, `fr`, `pt-BR`, `zh-CN`, `zh-TW`, `ru`, `id` e `ar`. Juntos somam ~184 KB de fonte; o bundle final tem 465 KB.

**Impacto:** o usuário baixa e parseia 7 idiomas que talvez nunca use. Não é crítico (136,9 KB gzip), mas é o maior ganho de bundle de baixo risco.

**Correção:** carregar o locale ativo por `import()` dinâmico, mantendo inglês síncrono como fallback; ao trocar de idioma, mostrar um estado curto de carregamento. Adicionar teste que garanta que todos os locales resolvem.

**Aceite:** bundle inicial reduzido; troca de idioma funciona offline; fallback para inglês em falha de import.

---

### FE-04 — P2 — Acesso a `localStorage` sem proteção em pontos fora do helper

**Evidência:** `usePersistedConfig` tem `safeGetItem`/`safeSetItem`, mas estes pontos usam `localStorage` direto:

- `useSession.ts` — grava `scrcpy_window_positions` no efeito.
- `useDownloads.ts` — lê `scrcpy_onboarding_done` e grava em `completeOnboarding`.
- `LogPanel.tsx` — itera `localStorage` para o relatório.
- `ErrorBoundary.tsx` — itera `localStorage` para diagnóstico.

**Impacto:** em modo privado, cota cheia ou storage desabilitado, o efeito pode lançar e derrubar a árvore (ou falhar o botão de relatório). O teste existente cobre apenas `usePersistedConfig`.

**Correção:** centralizar em `safeGetItem`/`safeSetItem`/`safeRemoveItem` (ou um módulo `storage.ts` único) e usar em todos os pontos; adicionar teste para `useSession` com storage bloqueado.

**Aceite:** nenhum acesso direto a `localStorage` fora do helper; teste de storage bloqueado cobre os hooks.

---

### FE-05 — P2 — Contraste do tema claro abaixo de WCAG AA

**Evidência:** cálculo de contraste dos tokens atuais:

| Combinação | Contraste | AA texto pequeno (4,5:1) |
| --- | --- | --- |
| `--text-muted #808080` sobre `--bg-base #EEEEEE` | 3,40:1 | falha |
| `--text-muted #808080` sobre `--bg-surface #FAFAFA` | 3,78:1 | falha |
| `--text-subtle #AEAEAE` sobre `--bg-surface #FAFAFA` | 2,13:1 | falha |
| `--text-subtle #AEAEAE` sobre `--bg-base #EEEEEE` | 1,91:1 | falha |
| `--primary #3B5CF6` sobre `--bg-base #EEEEEE` | 4,47:1 | limite, falha por pouco |
| `--text-secondary #5C5C5C` sobre `#EEEEEE` | 5,76:1 | passa |
| `--text-muted #AEAEAE` sobre `#2E2E2E` (dark) | 6,12:1 | passa |

`.ds-caption` usa 11 px, então precisa de 4,5:1, não 3:1.

**Impacto:** textos de ajuda, placeholders, legendas e estados ficam difíceis de ler no tema claro, especialmente em telas de baixa qualidade.

**Correção:** escurecer `--text-muted` e `--text-subtle` no tema claro até >= 4,5:1; manter o tema escuro. Validar com axe ou teste de contraste no CI.

**Aceite:** todos os tokens de texto passam 4,5:1 nos fundos em que são usados; contraste documentado.

---

### FE-06 — P2 — Suporte a RTL (árabe) é só nominal

**Evidência:** `i18n/index.tsx` seta `dir="rtl"` para `ar`, mas os componentes usam utilitários físicos: `ml-auto`, `left-1/2`, `text-left`, `left-0`, `right-0`, `pl-*`, `pr-*` etc. Não há uso de `ms-*`/`me-*`/`start-*`/`end-*`/`text-start`.

**Impacto:** no árabe, headers, badges, tooltips, modais e alinhamentos de texto podem ficar espelhados incorretamente. Como o árabe é um dos 8 locales suportados, isso é uma regressão de qualidade.

**Correção:** migrar utilitários direcionais para lógicos (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`), revisar ícones direcionais (setas) e testar o árabe com screenshot.

**Aceite:** layout árabe funcional em 360/768/1200 px; nenhum overflow; ícones direcionais corretos.

---

### FE-07 — P2 — Dependências de efeitos e closures obsoletas

**Evidência:**

- `App.tsx`: o efeito de drag & drop depende só de `[activeDevice]`, mas chama `handleFileOperation`, que captura `installApk`/`pushFile` e `t` do render em que o efeito foi criado.
- `App.tsx`: o efeito inicial usa `[]`, mas chama `checkScrcpy(config.scrcpyPath)` e `refreshDevicesUntilSettled(config.scrcpyPath)`; o valor inicial é o salvo, então funciona no boot, mas não é robusto a mudanças.
- `useDevices.ts`: `refreshDevices` usa `isRefreshing` do closure como guarda; duas chamadas no mesmo tick podem passar antes do state atualizar. O `fetchInFlightRef` reduz o dano, mas a guarda não é atômica.

**Impacto:** comportamento dependente de idioma/estado antigo; chamadas duplicadas em cenários de clique rápido; difícil de reproduzir.

**Correção:** usar `useEffectEvent` (React 19) ou refs para callbacks em efeitos; trocar guardas de estado por refs quando a atomicidade importa; adicionar lint de hooks (FE-01).

**Aceite:** lint de hooks sem `eslint-disable`; teste de drag & drop após troca de locale; teste de refresh concorrente.

---

### FE-08 — P3 — Dynamic import ineficaz do `@tauri-apps/api/core`

**Evidência:** o build emite:

```text
[INEFFECTIVE_DYNAMIC_IMPORT] node_modules/@tauri-apps/api/core.js is dynamically imported
by src/App.tsx but also statically imported by ... dynamic import will not move module into another chunk.
```

**Impacto:** falsa sensação de code splitting; nenhum chunk separado é criado.

**Correção:** importar `invoke` estaticamente em `App.tsx` (como os outros módulos já fazem) ou isolar os imports dinâmicos em um módulo que só seja carregado sob demanda.

**Aceite:** warning desaparece do build.

---

### FE-09 — P3 — `alert()` nativo em fluxos de erro/relatório

**Evidência:** `LogPanel.tsx` e `ErrorBoundary.tsx` usam `alert()` quando `onAddLog` não existe. O restante do app usa `showAlert`/`ThemedModal`.

**Impacto:** quebra o design, bloqueia a thread, não é acessível e não segue o tema.

**Correção:** usar `showAlert` com `kind: 'success'`/`'error'`, ou o `AlertHost` já montado.

**Aceite:** nenhum `alert()` no `src/`; teste de exportação de relatório.

---

### FE-10 — P3 — Teste de i18n cobre só `alerts.*` e `logs.*`

**Evidência:** `src/i18n/locales.alert-keys.test.ts` varre apenas chaves `alerts.`/`logs.`; as demais chaves podem faltar e cair no fallback inglês silencioso.

**Impacto:** locales podem ficar parcialmente traduzidos sem o CI perceber.

**Correção:** extrair todas as chaves usadas por `t('...')` (incluindo templates) e comparar a árvore completa entre locales; validar placeholders `{var}`.

**Aceite:** teste falha se qualquer locale perder uma chave ou placeholder.

---

### FE-11 — P3 — Relatório de diagnóstico exporta todo o `localStorage`

**Evidência:** `LogPanel.tsx` e `ErrorBoundary.tsx` copiam todas as chaves de `localStorage` para o JSON.

**Impacto:** o relatório pode incluir histórico de dispositivos, caminhos e configurações; não há segredos hoje, mas é um vetor de privacidade desnecessário.

**Correção:** exportar apenas uma allowlist (`scrcpy_config`, logs, versões, SO) e omitir histórico/caminhos pessoais.

**Aceite:** relatório contém apenas chaves documentadas.

---

### FE-12 — P3 — CSS de scrollbar duplicado

**Evidência:** `src/index.css` define `::-webkit-scrollbar` duas vezes (linhas ~97–101 e ~122–127).

**Impacto:** manutenção; a segunda definição sobrescreve a primeira.

**Correção:** remover o bloco duplicado.

**Aceite:** build CSS sem duplicação; visual inalterado.

---

### FE-13 — P3 — Um único ErrorBoundary global

**Evidência:** `App.tsx` envolve toda a aplicação em um único `ErrorBoundary`; um erro em um painel derruba a tela inteira.

**Impacto:** falha local vira tela de erro global.

**Correção:** boundaries por região (Sidebar, ControlPanel, LogPanel) com fallback local e botão de recarregar região.

**Aceite:** erro injetado em um painel mantém o restante utilizável.

---

### FE-14 — P3 — Tooltip pode ser cortado em containers com scroll/overflow

**Evidência:** `Tooltip` posiciona um `absolute` dentro do fluxo, sem portal. `Sidebar` tem `max-h-[220px] overflow-y-auto`; `ControlPanel` e `LogPanel` também têm containers com overflow.

**Impacto:** tooltips próximos às bordas podem ficar cortados ou sobrepostos.

**Correção:** renderizar via portal (`createPortal`) com posicionamento calculado, ou usar floating-ui.

**Aceite:** tooltip visível em todos os cantos dos painéis com scroll.

---

### FE-15 — P3 — `Select` não tem typeahead

**Evidência:** o listbox aceita setas/Home/End/Enter, mas não digitar letras para pular para uma opção.

**Impacto:** listas longas (lentes de câmera, render drivers) exigem muitas setas.

**Correção:** buffer de digitação com timeout, padrão ARIA listbox.

**Aceite:** digitar “front” seleciona a opção correspondente.

---

### FE-16 — P3 — Busca de nome amigável sem cancelamento

**Evidência:** `useDevices.ts` faz `devices.forEach(async ...)` e chama `invoke('adb_shell')`; não há `AbortController`/flag de montagem, e o efeito roda a cada mudança de `devices`.

**Impacto:** chamadas podem terminar após unmount ou após o dispositivo desconectar; o guard de serial evita repetição, mas não cancela o trabalho.

**Correção:** usar um `AbortController`/flag por serial e ignorar resultados de seriais que saíram da lista.

**Aceite:** teste com unmount durante a chamada; nenhum `setState` após unmount.

---

### FE-17 — P3 — Fonte Inter carregada do Google Fonts

**Evidência:** `index.html` carrega `fonts.googleapis.com`; a CSP permite. Em máquina offline, cai para a fonte do sistema.

**Impacto:** dependência de rede no primeiro paint e possível FOIT; em ambiente desktop offline, a identidade visual muda.

**Correção:** empacotar a fonte (woff2) em `src/assets` e remover origens externas da CSP.

**Aceite:** app offline usa Inter; CSP não precisa de `fonts.googleapis.com`.

---

## 4. Avaliação de frameworks

### 4.1 Critérios usados

1. Adequação a Tauri (SPA estático, WebView, sem SSR).
2. Tamanho/performance de runtime.
3. Ecossistema, maturidade e oferta de componentes.
4. Custo de migração do código atual.
5. Testabilidade e acessibilidade.
6. Disponibilidade de mão de obra/manutenção.

### 4.2 Dados públicos consultados

- **Tauri — Frontend Configuration** (atualizado em 2026-11-05): o Tauri é frontend-agnóstico e recomenda Vite para SPAs com React, Vue, Svelte e Solid. Não suporta SSR nativamente.
- **State of JavaScript 2025**: React segue dominante em uso; Solid tem a maior satisfação há cinco anos, com adoção por ~10% dos respondentes; satisfação geral de frameworks estável; principais dores: sobrecarga cognitiva, ecossistema e performance.
- **React Compiler 1.0** (2025-10-07): estável, produção no Meta, memoização automática, suporte a Vite; relatos de até 12% de melhora em carregamentos e >2,5× em certas interações.
- **Svelte 5** (2024-10-22): reescrita com runes, compilador, apps menores e mais rápidos; TypeScript nativo.
- **SolidJS**: sem virtual DOM, atualizações fine-grained, componentes executam uma vez; integra com Vite.
- **Preact**: alternativa de ~4 kB com API React e `preact/compat`.
- **npm/GitHub em 2026-11-07**: downloads/mês aproximados — React 848M, Preact 183M, Vue 82M, Solid 36M, Svelte 31M; estrelas — React ~252k, Svelte ~89k, Vue ~55k, Dioxus ~40k, Preact ~39k, Solid ~36k, Leptos ~21k.

> Downloads e estrelas medem ecossistema/adoção, não qualidade técnica. O benchmark de frameworks é útil para operações de tabela, mas não representa o perfil deste app (formulários, logs, IPC, áudio, dispositivos).

### 4.3 Comparativo

| Framework | Pontos fortes | Pontos fracos para este app | Migração | Veredito |
| --- | --- | --- | --- | --- |
| **React 19 + Vite (atual)** | Maior ecossistema; todos os testes existentes; React Compiler 1.0; Tauri recomenda Vite; ferramental maduro | Virtual DOM; memoização manual; bundle maior que soluções compiladas | — | **Manter** |
| **Svelte 5** | Compilado; runtime pequeno; runes; ótima sinergia com Tauri/Vite; código enxuto | Ecossistema menor que React; reescrever 19 componentes, 5 hooks, 8 locales e 24 arquivos de teste; padrões de acessibilidade/portal diferentes | Alta (semanas) | **Melhor alternativa se houver reescrita** |
| **SolidJS** | Fine-grained, muito rápido, JSX/TS parecido com React; sem VDOM | Ecossistema menor; testing/component libraries diferentes; reescrever a mesma base | Alta | **Segunda opção** |
| **Preact** | API React, ~4 kB, `preact/compat`, migração incremental | React 19 features/ecossistema podem não ser 1:1; ganho de bundle não resolve os problemas atuais | Média-baixa | **Não compensa** |
| **Vue 3** | Maduro, DX excelente, bom ecossistema | Runtime maior; sem ganho claro de performance para este app; reescrita completa | Alta | **Não recomendado** |
| **Leptos (Rust/WASM)** | Compartilha tipos com o backend Rust; sem JS no frontend | WASM inicial maior; ecossistema UI menor; depuração e integração WebView mais complexas; equipe precisa de Rust no frontend | Muito alta | **Não agora** |
| **Dioxus (Rust/WASM)** | Proposta semelhante ao Leptos; bom para apps Rust-first | Mesmos riscos de WASM/ecossistema; Tauri não lista como caminho principal | Muito alta | **Não agora** |
| **Qwik/Angular** | Qwik para resumabilidade; Angular para estrutura corporativa | SSR/resumabilidade não é o problema de um app desktop; Angular é pesado | Muito alta | **Não recomendado** |

### 4.4 Leitura dos dados

- **Svelte 5** é a alternativa mais coerente com Tauri: compila para JS enxuto, tem runes/TypeScript nativo e a documentação do Tauri lista SvelteKit/Vite. Para um app desktop offline, o tamanho e a simplicidade de runtime importam.
- **Solid** ganha em reatividade fina e mantém JSX/TS, então a curva para quem vem de React é menor. Porém o ecossistema de componentes e testes é menor; a migração não é “trocar o import”.
- **Preact** reduziria o runtime, mas o app não sofre de bundle excessivo (136,9 KB gzip) e a compatibilidade com React 19 não é garantida. O risco supera o ganho.
- **Vue** é excelente, mas não oferece vantagem decisiva sobre React para este caso e exigiria reescrever tudo.
- **Rust/WASM (Leptos/Dioxus)** faz sentido se o objetivo for unificar a linguagem e compartilhar tipos com o backend. Não é o caso agora: o custo de tooling, WASM e contratação é alto para um app que já funciona.

---

## 5. Recomendação e sequência

### Curto prazo (1–2 sprints) — sem migração

1. **FE-01**: adicionar ESLint 9 + `eslint-plugin-react-hooks` + `jsx-a11y`; rodar no CI.
2. **FE-04**: centralizar `localStorage` seguro.
3. **FE-05**: corrigir contraste do tema claro.
4. **FE-07**: eliminar closures obsoletas e guardas de estado frágeis.
5. **FE-03**: carregar locales sob demanda.
6. **FE-02**: habilitar React Compiler em branch de teste e medir.

### Médio prazo (1–2 meses)

7. **FE-06**: migrar utilitários para propriedades lógicas e validar árabe.
8. **FE-10/FE-11**: cobertura total de i18n e relatório de diagnóstico com allowlist.
9. **FE-08/FE-09/FE-12/FE-13/FE-14/FE-15/FE-16/FE-17**: limpeza e robustez.
10. Adicionar teste de acessibilidade automatizado (axe) nas telas principais.

### Longo prazo (somente se houver reescrita)

- Fazer um **piloto Svelte 5** em uma tela isolada (`ShortcutsPanel` ou `OnboardingModal`) para medir:
  - linhas de código;
  - bundle;
  - tempo de build;
  - esforço de teste;
  - acessibilidade.
- Só decidir a migração completa com dados do piloto. Sem um motivo de produto (ex.: equipe Svelte, necessidade de bundle muito menor), o custo de reescrever 4.800 linhas e 123 testes não se justifica.

---

## 6. Conclusão

O framework atual **não é o gargalo**. O app tem boa separação de hooks, testes verdes e bundle saudável. Os problemas reais são de **disciplina de frontend**: lint ausente, i18n eager, contraste, RTL, storage e closures. Corrigir isso rende mais do que trocar React por Svelte/Solid.

Se a pergunta for “qual framework é tecnicamente melhor para um app Tauri pequeno e offline?”, a resposta é **Svelte 5**, com **Solid** em segundo. Se a pergunta for “vale migrar o OpenScrcpy agora?”, a resposta é **não** — a não ser que exista uma reescrita planejada e orçada.
