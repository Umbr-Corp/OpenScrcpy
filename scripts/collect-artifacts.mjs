#!/usr/bin/env node
/**
 * Gathers the bundles that `tauri build` produced into a single directory so
 * the release workflow can upload them in one go.
 *
 * The Tauri CLI writes the updater signature next to the bundle
 * (`<artifact>.sig`); those travel with the artifact they belong to.
 */

import { readdir, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const BUNDLE_DIR = process.env.BUNDLE_DIR ?? 'src-tauri/target/release/bundle';
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

async function collect() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const copied = [];

  for (const wanted of WANTED) {
    const [folder, pattern] = wanted.split('/');
    const dir = path.join(BUNDLE_DIR, folder);

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

  console.log(`collect: ${copied.length} files in ${OUTPUT_DIR}`);
  for (const name of copied) console.log(`  ${name}`);
}

await collect();
