#!/usr/bin/env node
/**
 * Publishes a release to the forge the tag was pushed to.
 *
 * The runner provides `GITHUB_API_URL`, `GITHUB_REPOSITORY` and
 * `GITHUB_SERVER_URL` on both GitHub Actions and Forgejo Actions, so the same
 * script talks to both. The single difference is where the asset bytes go:
 * GitHub wants uploads.github.com, Forgejo wants the API root itself.
 *
 * Two modes:
 *   upload   create (or reuse) the release and upload the artifacts of one
 *            build platform
 *   manifest rebuild `updater/latest.json` from the published assets and push
 *            it to the default branch, which is what the Tauri updater polls
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { buildUpdaterManifest, withSignatures } from './updater-manifest.mjs';

const API_URL = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/+$/, '');
const SERVER_URL = (process.env.GITHUB_SERVER_URL ?? 'https://github.com').replace(/\/+$/, '');
const REPOSITORY = process.env.GITHUB_REPOSITORY ?? '';
const TOKEN = process.env.TOKEN ?? process.env.GITHUB_TOKEN ?? '';
const TAG = process.env.GITHUB_REF_NAME ?? '';

const UPLOAD_URL = API_URL.includes('api.github.com')
  ? 'https://uploads.github.com'
  : API_URL;

/** GitHub serves asset metadata as JSON unless the client asks for the bytes. */
const IS_GITHUB = API_URL.includes('api.github.com');

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function repoPath(suffix) {
  if (!REPOSITORY) fail('GITHUB_REPOSITORY is not set');
  return `/repos/${REPOSITORY}${suffix}`;
}

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = { Authorization: `token ${TOKEN}` };
  if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    fail(`${method} ${path} -> ${response.status} ${text.slice(0, 300)}`);
  }

  return response;
}

async function apiJson(path, options) {
  const response = await api(path, options);
  return response.json();
}

async function findRelease() {
  const response = await fetch(`${API_URL}${repoPath(`/releases/tags/${TAG}`)}`, {
    headers: { Authorization: `token ${TOKEN}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) fail(`GET release by tag -> ${response.status}`);
  return response.json();
}

async function createRelease(body) {
  const existing = await findRelease();
  if (existing) {
    console.log(`release: reusing ${existing.html_url}`);
    return existing;
  }

  // Two matrix jobs can reach this point at the same time. The loser gets a
  // 422 and simply reads the release the winner created.
  const response = await fetch(`${API_URL}${repoPath('/releases')}`, {
    method: 'POST',
    headers: { Authorization: `token ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (response.status === 422) {
    const existing = await findRelease();
    if (existing) return existing;
  }
  if (!response.ok) {
    const text = await response.text();
    fail(`POST release -> ${response.status} ${text.slice(0, 300)}`);
  }

  const release = await response.json();
  console.log(`release: created ${release.html_url}`);
  return release;
}

async function uploadAsset(release, filePath) {
  const name = path.basename(filePath);
  const bytes = await readFile(filePath);

  const stale = (release.assets ?? []).find((asset) => asset.name === name);
  if (stale) {
    console.log(`release: replacing ${name}`);
    await api(repoPath(`/releases/assets/${stale.id}`), { method: 'DELETE' });
  }

  const response = await fetch(
    `${UPLOAD_URL}${repoPath(`/releases/${release.id}/assets`)}?name=${encodeURIComponent(name)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${TOKEN}`,
        'Content-Type': 'application/octet-stream',
      },
      body: bytes,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    fail(`POST asset ${name} -> ${response.status} ${text.slice(0, 300)}`);
  }

  console.log(`release: uploaded ${name} (${bytes.length} bytes)`);
}

function releaseNotes() {
  try {
    const previous = execFileSync('git', ['describe', '--tags', '--abbrev=0', `${TAG}^`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    const log = execFileSync(
      'git',
      ['log', '--no-merges', '--pretty=format:* %s (%h)', `${previous}..${TAG}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();

    if (log) return log;
  } catch {
    // No previous tag, or a shallow clone: fall through to the default body.
  }

  return `See the assets below for the release.`;
}

async function collectAssets(release) {
  const assets = [];

  for (const asset of release.assets ?? []) {
    const headers = { Authorization: `token ${TOKEN}` };
    if (IS_GITHUB) headers.Accept = 'application/octet-stream';

    const response = await fetch(
      `${API_URL}${repoPath(`/releases/assets/${asset.id}`)}`,
      { headers },
    );
    if (!response.ok) fail(`GET asset ${asset.name} -> ${response.status}`);

    assets.push({
      name: asset.name,
      signature: asset.name.endsWith('.sig')
        ? (await response.text()).trim()
        : null,
    });
  }

  return assets;
}

async function uploadMode(artifactsDir) {
  const version = JSON.parse(await readFile('package.json', 'utf8')).version;
  const release = await createRelease({
    tag_name: TAG,
    name: `OpenScrcpy v${version}`,
    body: releaseNotes(),
    draft: false,
    prerelease: false,
    target_commitish: TAG,
  });

  let files = [];
  try {
    files = await readdir(artifactsDir);
  } catch {
    fail(`no artifacts directory at ${artifactsDir}`);
  }

  for (const file of files) {
    const full = path.join(artifactsDir, file);
    const info = await stat(full);
    if (!info.isFile()) continue;
    await uploadAsset(release, full);
  }

  console.log(`release: ${files.length} assets on ${release.html_url}`);
}

async function manifestMode() {
  const release = await findRelease();
  if (!release) fail(`no release found for tag ${TAG}`);

  const version = JSON.parse(await readFile('package.json', 'utf8')).version;
  const assets = await collectAssets(release);
  const artifacts = withSignatures(assets).filter((artifact) => artifact.signature);

  const manifest = buildUpdaterManifest({
    version,
    notes: release.body ?? '',
    pubDate: release.published_at ?? new Date().toISOString(),
    baseUrl: `${SERVER_URL}/${REPOSITORY}/releases/download/${TAG}`,
    artifacts,
  });

  if (Object.keys(manifest.platforms).length === 0) {
    fail('no signed artifact found in the release');
  }

  await mkdir('updater', { recursive: true });
  await writeFile('updater/latest.json', `${JSON.stringify(manifest, null, 2)}\n`);

  execFileSync('git', ['add', 'updater/latest.json']);
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (!status) {
    console.log('manifest: updater/latest.json already up to date');
    return;
  }

  execFileSync('git', [
    '-c', 'user.name=forgejo-actions[bot]',
    '-c', 'user.email=forgejo-actions[bot]@users.noreply.forgejo.org',
    'commit', '-m', `chore(release): updater manifest for ${TAG}`,
  ]);

  const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  if (branch === 'HEAD') fail('detached HEAD: the manifest job must check out the default branch');

  execFileSync('git', ['push', 'origin', branch], { stdio: 'inherit' });

  console.log(`manifest: updater/latest.json published for ${TAG} on ${branch}`);
}

const [mode, ...rest] = process.argv.slice(2);
const artifactsDir = rest[0] ?? 'artifacts';

if (mode === 'upload') {
  await uploadMode(artifactsDir);
} else if (mode === 'manifest') {
  await manifestMode();
} else {
  fail('usage: publish-release.mjs <upload [artifactsDir] | manifest>');
}
