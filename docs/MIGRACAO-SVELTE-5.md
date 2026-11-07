# Migração para Svelte 5

**Data:** 2026-11-07  
**Branch:** `feat/svelte-5`  
**Status:** migração concluída; build, `tsc` e testes verdes.

---

## 1. Resultado

O frontend foi migrado de React 19 para **Svelte 5 com runes**, sem React no bundle nem nas dependências.

| Métrica | React (antes) | Svelte 5 (depois) |
| --- | --- | --- |
| Bundle JS principal | 465,32 KB / 136,90 KB gzip | **224,68 KB / 67,56 KB gzip** |
| CSS | 27,71 KB / 6,04 KB gzip | 28,39 KB / 6,13 KB gzip |
| Locales | 8 no bundle inicial | 8 chunks lazy (14–25 KB cada) |
| `tsc --noEmit` | limpo | limpo |
| `svelte-check` | — | **0 erros**, 2 warnings de a11y |
| Testes | 123 (React Testing Library) | **61** (Vitest + Testing Library Svelte) |

O bundle inicial caiu aproximadamente **51%** (gzip) e cada locale só é baixado quando selecionado.

---

## 2. O que mudou

### Estrutura

- `src/App.tsx` → `src/App.svelte`
- `src/main.tsx` → `src/main.ts` (`mount` do Svelte 5)
- Componentes `.tsx` → `.svelte`
- Hooks React (`useDevices`, `useSession`, `useDownloads`, `usePersistedConfig`) → um store central em `src/lib/scrcpy.svelte.ts` com runes (`$state`, getters e métodos).
- `i18n/index.tsx` → `src/i18n/state.svelte.ts`, com carregamento dinâmico de locale.
- `alerts.ts` (store externo com `useSyncExternalStore`) → `src/lib/alerts.svelte.ts`.
- `lucide-react` → `@lucide/svelte`.
- `vite.config.ts`: `@vitejs/plugin-react` → `@sveltejs/vite-plugin-svelte` + `svelteTesting`.
- `svelte.config.js` criado com `vitePreprocess`.
- CI: `npx tsc --noEmit` → `npm run lint` (`svelte-check`).
- `scripts/ipc-contract.mjs`: o contrato IPC agora varre `.svelte` também.

### Componentes Svelte

- `App`, `Header`, `Sidebar`, `ControlPanel`, `SessionBehavior`, `LogPanel`
- `OnboardingModal`, `ThemedModal`, `SheetModal`, `Modal`, `AlertHost`, `ErrorBoundary`
- `Select`, `SliderRow`, `ToggleRow`, `Tooltip`, `ProgressBar`
- `PerformanceGrid`, `ResolutionSelect`, `CodecSelect`, `FpsSelect`, `RotationSelect`, `MicMeter`
- `WindowResizeEdges`, `WindowButtons`, `ShortcutsPanel`, `SessionToggle`

### Testes

- Testes puros mantidos/portados: logs, alertas, storage, tipos, i18n, contrato IPC.
- Novos testes Svelte: `ProgressBar`, `Select`, `Modal`, `SliderRow`, `Header`, `Sidebar` e store `scrcpy`.

---

## 3. Verificação

```bash
npx tsc --noEmit
npm run lint          # svelte-check
npm test -- --run     # 61 testes
npm run build         # build de produção
```

Resultado em 2026-11-07:

- `tsc`: ok
- `svelte-check`: 0 erros, 2 warnings de a11y
- Vitest: **61 testes em 16 arquivos, todos passando**
- Build: ok; bundle principal **224,68 KB / 67,56 KB gzip**

---

## 4. Pendências e próximos passos

1. **Dois warnings de a11y**:
   - `Header.svelte`: `<header>` com `onmousedown`/`ondblclick` para arrastar a janela.
   - `Sidebar.svelte`: card de dispositivo com `role="group"` e `tabindex`, contendo botões internos.
2. **Paridade de testes**: a suíte caiu de 123 para 61 porque os testes de hooks React foram removidos. Falta portar cenários de:
   - descoberta/pareamento/reconexão de dispositivos;
   - download/onboarding/updater;
   - start/stop/substituição de sessão;
   - ErrorBoundary e foco de modais.
3. **QA manual em Tauri**: drag & drop, janela sem decoração, atalho global, microfone, câmera, desktop virtual e updater.
4. **Atualizar a auditoria de frontend**: o documento `docs/AUDITORIA-FRONTEND-2026-11-07.md` registra a recomendação anterior ("não migrar"); ele deve ser lido como estado pré-migração.
5. **Opcional**: avaliar React Compiler deixa de ser relevante; o próximo ganho é reduzir os warnings e ampliar a suíte.

---

## 5. Rollback

A migração está isolada na branch `feat/svelte-5`. Para voltar ao estado React:

```bash
git checkout main
```

Nenhuma alteração de backend Rust foi feita nesta migração.
