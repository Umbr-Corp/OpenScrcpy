# Baseline do refino

> **Histórico da base 1.1.7/React.** O baseline vigente da versão 2.0.0 está em
> [`docs/AUDITORIA-2.0.0-2026-11-13.md`](../AUDITORIA-2.0.0-2026-11-13.md).

Data: 29/10/2026
Branch: `chore/refino-baseline`, criada a partir de `fix/release-manifest-assets` (2 commits à frente da `main`).

## Ambiente

| Item | Versão |
| --- | --- |
| Linux | 7.3.0-4-cachyos, x86_64 |
| Node | v22.23.2 |
| npm | 12.2.0 |
| Rust | 1.99.1 |
| Cargo | 1.99.1 |

## Resultado inicial

| Comando | Antes | Depois |
| --- | --- | --- |
| `npm ci` | ok, 195 pacotes | ok |
| `npx tsc --noEmit` | ok | ok |
| `npm test` | 16 arquivos, 94 testes | 16 arquivos, 94 testes |
| `cargo fmt --check` | falha, 5 trechos | ok |
| `cargo clippy --all-targets -- -D warnings` | falha, 8 lints | ok |
| `cargo test` | 35 testes | 35 testes |

## Correções aplicadas para deixar o gate verde

1. `cargo fmt` em `src-tauri/src/commands.rs`.
2. `let...else` substituído por `?` em duas funções de sink do PulseAudio.
3. Removido `&` redundante em `format!`.
4. `chunks_exact(2)` trocado por `as_chunks::<2>()`.
5. `max().min()` trocado por `clamp()`.
6. Divisão do percentual de download trocada por `checked_div`.
7. `map_or(false, ...)` trocado por `is_some_and`.
8. `tauri-plugin-shell` substituído por `tauri-plugin-opener` em `open_app_release`, porque `Shell::open` está depreciado. A permissão `shell:default` foi removida da capability; o frontend não usava o plugin.

## Pendências conhecidas

- `npm audit` reporta 9 vulnerabilidades (3 moderadas, 6 altas) em dependências de desenvolvimento. Fora do escopo deste refino.
- A branch base tem 2 commits de release ainda não mesclados na `main`. O refino será empilhado sobre eles.
- O CI da base cobria só Ubuntu, sem `cargo test`, `fmt` e `-D warnings`. Resolvido na Fase 9.

## Como reproduzir

```bash
npm ci
npx tsc --noEmit
npm test
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Matriz de CI

`.github/workflows/pull_request.yml` roda os seis comandos acima em
`ubuntu-22.04`, `windows-latest` e `macos-latest`. O build Tauri completo
(`npm run tauri build -- --no-bundle`) roda só no Ubuntu, para limitar custo.

Para reproduzir a matriz localmente, rode a sequência acima no sistema alvo
depois de instalar as dependências de build. No Linux, o job instala
`libwebkit2gtk-4.1-dev`, `libxdo-dev`, `libayatana-appindicator3-dev`,
`librsvg2-dev`, `libjavascriptcoregtk-4.1-dev` e `libsoup-3.0-dev`. Windows e
macOS usam as dependências nativas do runner.

O contrato IPC (`scripts/ipc-contract.mjs`) falha quando um comando está no
`generate_handler!` sem `invoke` no frontend, ou quando o frontend chama um
comando que não está registrado.
