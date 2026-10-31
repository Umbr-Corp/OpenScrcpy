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
  it('matches in package.json, tauri.conf.json, Cargo.toml and Cargo.lock', () => {
    const versions = {
      'package.json': JSON.parse(read('package.json')).version,
      'tauri.conf.json': JSON.parse(read('src-tauri/tauri.conf.json')).version,
      'Cargo.toml': read('src-tauri/Cargo.toml').match(/^version = "([^"]+)"$/m)?.[1],
      'Cargo.lock': cargoPackageVersion(),
    };

    expect(new Set(Object.values(versions)).size).toBe(1);
  });

  // latest.json describes the last published release, not the version being
  // built: the release workflow rewrites it from the signed assets after the
  // tag. Requiring it to match here would block every version bump PR.
  it('keeps updater/latest.json readable for the updater', () => {
    const manifest = JSON.parse(read('updater/latest.json'));

    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof manifest.platforms).toBe('object');
  });
});
