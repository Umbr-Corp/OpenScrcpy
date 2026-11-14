#!/usr/bin/env node
/**
 * Gathers the bundles that `tauri build` produced into a single directory so
 * the release workflow can upload them in one go.
 *
 * The Tauri CLI writes the updater signature next to the bundle
 * (`<artifact>.sig`); those travel with the artifact they belong to.
 *
 * `tauri build --target <triple>` writes to `target/<triple>/release/bundle`
 * instead of `target/release/bundle` (macOS universal builds do this), so the
 * default scan walks every target directory. `BUNDLE_DIR` overrides the scan.
 */

import { readdir, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const TARGET_DIR = 'src-tauri/target';
const OUTPUT_DIR = process.env.ARTIFACTS_DIR ?? 'artifacts';

/** Bundles worth publishing, relative to the bundle directory. */
const WANTED = [
  'deb/*.deb',
  'rpm/*.rpm',
  'appimage/*.AppImage',
  'msi/*.msi',
  'nsis/*setup.exe',
  'macos/*.app.tar.gz',
  'dmg/*.dmg',
];

async function bundleDirs() {
  if (process.env.BUNDLE_DIR) return [process.env.BUNDLE_DIR];

  const candidates = [path.join(TARGET_DIR, 'release', 'bundle')];
  try {
    const entries = await readdir(TARGET_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'release') continue;
      candidates.push(path.join(TARGET_DIR, entry.name, 'release', 'bundle'));
    }
  } catch {
    // No target directory yet: the loop below reports the missing folders.
  }

  const dirs = [];
  for (const dir of candidates) {
    try {
      await readdir(dir);
      dirs.push(dir);
    } catch {
      // This target was not built.
    }
  }
  return dirs;
}

async function collect() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const copied = [];
  const seen = new Set();

  for (const bundleDir of await bundleDirs()) {
    for (const wanted of WANTED) {
      const [folder, pattern] = wanted.split('/');
      const dir = path.join(bundleDir, folder);

      let entries = [];
      try {
        entries = await readdir(dir);
      } catch {
        console.log(`collect: ${folder} not built, skipping`);
        continue;
      }

      const matches = entries.filter((name) => {
        if (!name.endsWith(path.extname(pattern))) return false;
        return pattern.startsWith('*') ? name.includes(pattern.slice(1)) : name === pattern;
      });

      for (const name of matches) {
        if (seen.has(name)) continue;
        seen.add(name);

        const source = path.join(dir, name);
        await copyFile(source, path.join(OUTPUT_DIR, name));
        copied.push(name);

        try {
          await copyFile(`${source}.sig`, path.join(OUTPUT_DIR, `${name}.sig`));
          copied.push(`${name}.sig`);
        } catch {
          console.log(`collect: no signature for ${name}`);
        }
      }
    }
  }

  console.log(`collect: ${copied.length} files in ${OUTPUT_DIR}`);
  for (const name of copied) console.log(`  ${name}`);
}

await collect();
