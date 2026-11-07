/** True inside the Tauri WebView; false in a plain browser preview. */
export function isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
