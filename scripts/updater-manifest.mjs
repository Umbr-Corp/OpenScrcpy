/**
 * Builds the Tauri updater manifest (`latest.json`) out of the artifacts that
 * `tauri build` produced.
 *
 * The updater looks the download up by platform key, so a single artifact can
 * answer for more than one key: the AppImage answers `linux-x86_64` and
 * `linux-x86_64-appimage`, the MSI answers `windows-x86_64` and
 * `windows-x86_64-msi`. The table below is the same one tauri-action uses, so
 * a manifest built here is byte-compatible with the one GitHub served.
 *
 * The signature is the content of the `<artifact>.sig` file that the Tauri
 * CLI writes next to the bundle (base64, minisign format).
 */

/** Artifact file name -> updater platform keys it answers for. */
export const ARTIFACT_TARGETS = [
  { pattern: /\.AppImage$/, keys: ['linux-x86_64', 'linux-x86_64-appimage'] },
  { pattern: /\.deb$/, keys: ['linux-x86_64-deb'] },
  { pattern: /\.rpm$/, keys: ['linux-x86_64-rpm'] },
  { pattern: /_x64-setup\.exe$/, keys: ['windows-x86_64-nsis'] },
  { pattern: /\.msi$/, keys: ['windows-x86_64', 'windows-x86_64-msi'] },
  { pattern: /\.app\.tar\.gz$/, keys: ['darwin-x86_64', 'darwin-aarch64', 'darwin-x86_64-app', 'darwin-aarch64-app'] },
];

/**
 * @param {object} options
 * @param {string} options.version         app version, without the leading "v"
 * @param {string} options.notes            release notes shown by the updater
 * @param {string} options.pubDate          ISO timestamp of the build
 * @param {string} options.baseUrl          release download root, no trailing slash
 * @param {{name: string, signature: string}[]} options.artifacts
 */
export function buildUpdaterManifest({ version, notes = '', pubDate, baseUrl, artifacts }) {
  const root = baseUrl.replace(/\/+$/, '');
  const platforms = {};

  for (const artifact of artifacts) {
    const target = ARTIFACT_TARGETS.find((candidate) => candidate.pattern.test(artifact.name));
    if (!target) continue;
    if (!artifact.signature) continue;

    const url = `${root}/${encodeURI(artifact.name)}`;
    for (const key of target.keys) {
      platforms[key] = { signature: artifact.signature, url };
    }
  }

  return {
    version,
    notes,
    pub_date: pubDate,
    platforms,
  };
}

/**
 * Pairs every artifact with the signature file that sits next to it.
 *
 * @param {{name: string, signature: string|null}[]} assets
 */
export function withSignatures(assets) {
  const signatures = new Map();
  for (const asset of assets) {
    if (!asset.name.endsWith('.sig')) continue;
    signatures.set(asset.name.slice(0, -'.sig'.length), asset);
  }

  return assets
    .filter((asset) => !asset.name.endsWith('.sig'))
    .map((asset) => ({
      name: asset.name,
      signature: signatures.get(asset.name)?.signature ?? null,
    }));
}
