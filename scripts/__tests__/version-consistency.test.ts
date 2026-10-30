import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relative: string): string {
  return readFileSync(path.resolve(process.cwd(), relative), 'utf8');
}

function cargoPackageVersion(): string | undefined {
  const block = read('src-tauri/Cargo.lock')
    .split(/\n{2,}/)
    .find((entry) => /^name = "openscrcpy"$/m.test(entry));
  return block?.match(/^version = "([^"]+)"$/m)?.[1];
}

describe('app version', () => {
  it('matches in package.json, tauri.conf.json, Cargo.toml, Cargo.lock and latest.json', () => {
    const versions = {
      'package.json': JSON.parse(read('package.json')).version,
      'tauri.conf.json': JSON.parse(read('src-tauri/tauri.conf.json')).version,
      'Cargo.toml': read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"$/m)?.[1],
      'Cargo.lock': cargoPackageVersion(),
      'updater/latest.json': JSON.parse(read('updater/latest.json')).version,
    };

    expect(new Set(Object.values(versions)).size).toBe(1);
  });
});
