import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * IPC contract between the Rust `generate_handler!` list and the `invoke`
 * calls in the frontend. A command registered but never called is dead
 * surface; a command called but not registered fails at runtime with
 * "command not found".
 */

/** Commands registered in the `generate_handler![...]` block of lib.rs. */
export function registeredCommands(libSource) {
  const block = libSource.match(/generate_handler!\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  return [...block.matchAll(/commands::([a-z][a-z0-9_]*)/g)].map((m) => m[1]);
}

/** Commands called through `invoke('name', ...)` in app sources. */
export function invokedCommands(sources) {
  const calls = new Set();
  const pattern = /\binvoke(?:<[^()]*>)?\s*\(\s*['"`]([a-z][a-z0-9_]*)['"`]/g;

  for (const source of sources) {
    for (const match of source.matchAll(pattern)) calls.add(match[1]);
  }

  return [...calls];
}

/** Registered-but-not-called and called-but-not-registered commands. */
export function diffIpcContract(registered, invoked) {
  const registeredSet = new Set(registered);
  const invokedSet = new Set(invoked);

  return {
    unused: [...registeredSet].filter((name) => !invokedSet.has(name)).sort(),
    unregistered: [...invokedSet].filter((name) => !registeredSet.has(name)).sort(),
  };
}

/** Raw source of every non-test .ts/.tsx/.svelte file under src/. */
export function appSources(root = process.cwd()) {
  const files = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'test') walk(full);
        continue;
      }
      if (!/\.(tsx?|svelte)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      files.push(readFileSync(full, 'utf8'));
    }
  }

  walk(path.join(root, 'src'));
  return files;
}
