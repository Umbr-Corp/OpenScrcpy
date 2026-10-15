/** Tauri runtime detection + safe wrappers.
 *
 *  Outside the Tauri WebView (plain `npm run dev` in a browser) the
 *  `@tauri-apps/api` internals are undefined: `getCurrentWindow()` throws
 *  synchronously and `invoke`/`listen` reject. These helpers let the UI
 *  render in "preview mode" instead of crashing, so the design system can
 *  be reviewed without `tauri dev`. All backend actions simply no-op/fail
 *  softly; every existing try/catch keeps working unchanged. */

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  );
}
