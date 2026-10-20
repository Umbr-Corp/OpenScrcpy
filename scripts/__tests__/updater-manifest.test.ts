import { describe, it, expect } from 'vitest';
import { buildUpdaterManifest, withSignatures } from '../updater-manifest.mjs';

const SIGNATURE = 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkK';

const assets = [
  { name: 'OpenScrcpy_1.1.7_amd64.AppImage', signature: null },
  { name: 'OpenScrcpy_1.1.7_amd64.AppImage.sig', signature: SIGNATURE },
  { name: 'OpenScrcpy_1.1.7_amd64.deb', signature: null },
  { name: 'OpenScrcpy_1.1.7_amd64.deb.sig', signature: SIGNATURE },
  { name: 'OpenScrcpy-1.1.7-1.x86_64.rpm', signature: null },
  { name: 'OpenScrcpy-1.1.7-1.x86_64.rpm.sig', signature: SIGNATURE },
  { name: 'OpenScrcpy_1.1.7_x64-setup.exe', signature: null },
  { name: 'OpenScrcpy_1.1.7_x64-setup.exe.sig', signature: SIGNATURE },
  { name: 'OpenScrcpy_1.1.7_x64_en-US.msi', signature: null },
  { name: 'OpenScrcpy_1.1.7_x64_en-US.msi.sig', signature: SIGNATURE },
  { name: 'OpenScrcpy_universal.app.tar.gz', signature: null },
  { name: 'OpenScrcpy_universal.app.tar.gz.sig', signature: SIGNATURE },
  { name: 'OpenScrcpy_1.1.7_universal.dmg', signature: null },
];

describe('withSignatures', () => {
  it('pairs every artifact with the signature file next to it', () => {
    const paired = withSignatures(assets);

    expect(paired.map((a) => a.name)).not.toContain('OpenScrcpy_1.1.7_amd64.AppImage.sig');
    expect(paired.find((a) => a.name === 'OpenScrcpy_1.1.7_amd64.AppImage')?.signature).toBe(SIGNATURE);
  });

  it('leaves artifacts without a signature unsigned', () => {
    const paired = withSignatures(assets);

    expect(paired.find((a) => a.name === 'OpenScrcpy_1.1.7_universal.dmg')?.signature).toBeNull();
  });
});

describe('buildUpdaterManifest', () => {
  const manifest = buildUpdaterManifest({
    version: '1.1.7',
    notes: 'See the assets below for the release.',
    pubDate: '2026-10-20T05:05:49.929Z',
    baseUrl: 'https://v16.next.forgejo.org/UmbrCorp/OpenScrcpy/releases/download/v1.1.7',
    artifacts: withSignatures(assets).filter((a) => a.signature),
  });

  it('answers every platform key the updater looks for', () => {
    expect(Object.keys(manifest.platforms).sort()).toEqual([
      'darwin-aarch64',
      'darwin-aarch64-app',
      'darwin-x86_64',
      'darwin-x86_64-app',
      'linux-x86_64',
      'linux-x86_64-appimage',
      'linux-x86_64-deb',
      'linux-x86_64-rpm',
      'windows-x86_64',
      'windows-x86_64-msi',
      'windows-x86_64-nsis',
    ]);
  });

  it('points every key at the forge download path', () => {
    expect(manifest.platforms['linux-x86_64'].url).toBe(
      'https://v16.next.forgejo.org/UmbrCorp/OpenScrcpy/releases/download/v1.1.7/OpenScrcpy_1.1.7_amd64.AppImage',
    );
    expect(manifest.platforms['windows-x86_64-nsis'].url).toBe(
      'https://v16.next.forgejo.org/UmbrCorp/OpenScrcpy/releases/download/v1.1.7/OpenScrcpy_1.1.7_x64-setup.exe',
    );
  });

  it('carries the signature of the artifact it serves', () => {
    expect(manifest.platforms['linux-x86_64-deb'].signature).toBe(SIGNATURE);
  });

  it('leaves the dmg out: it is not an updater target', () => {
    expect(Object.values(manifest.platforms).some((p) => p.url.endsWith('.dmg'))).toBe(false);
  });

  it('keeps the version and the notes', () => {
    expect(manifest.version).toBe('1.1.7');
    expect(manifest.notes).toBe('See the assets below for the release.');
    expect(manifest.pub_date).toBe('2026-10-20T05:05:49.929Z');
  });
});
