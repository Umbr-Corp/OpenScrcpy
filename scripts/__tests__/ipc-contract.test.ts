import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appSources,
  diffIpcContract,
  invokedCommands,
  registeredCommands,
} from '../ipc-contract.mjs';

function read(relative: string): string {
  return readFileSync(path.resolve(process.cwd(), relative), 'utf8');
}

describe('IPC contract', () => {
  it('registers every invoked command and calls every registered one', () => {
    const lib = read('src-tauri/src/lib.rs');

    const contract = diffIpcContract(
      registeredCommands(lib),
      invokedCommands(appSources()),
    );

    expect(contract).toEqual({ unused: [], unregistered: [] });
  });

  it('reports drift in both directions', () => {
    const lib = 'generate_handler![commands::used, commands::orphan]';
    const sources = ["invoke('used')", "invoke<Result>('ghost', { id: 1 })"];

    expect(
      diffIpcContract(registeredCommands(lib), invokedCommands(sources)),
    ).toEqual({ unused: ['orphan'], unregistered: ['ghost'] });
  });
});
