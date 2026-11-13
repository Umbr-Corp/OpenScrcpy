import '@testing-library/jest-dom/vitest';

/**
 * Node 22.4+ defines an experimental `localStorage` global that stays
 * unavailable unless the process is started with `--localstorage-file`.
 * Vitest's jsdom environment skips globals that already exist on
 * `globalThis`, so `window.localStorage` is left undefined and every test
 * that touches storage fails with "Cannot read properties of undefined".
 *
 * Provide a minimal in-memory implementation only when jsdom did not set
 * one. The app helpers already treat storage as best-effort, so this is
 * enough to exercise the real code paths on every supported Node version.
 */
class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();

    get length(): number {
        return this.values.size;
    }

    clear(): void {
        this.values.clear();
    }

    getItem(key: string): string | null {
        return this.values.get(String(key)) ?? null;
    }

    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string): void {
        this.values.delete(String(key));
    }

    setItem(key: string, value: string): void {
        this.values.set(String(key), String(value));
    }
}

function ensureLocalStorage(): void {
    if (typeof window === 'undefined') return;

    try {
        if (window.localStorage) return;
    } catch {
        // Access can throw when the webview blocks storage.
    }

    const storage = new MemoryStorage();
    for (const target of [window, globalThis]) {
        Object.defineProperty(target, 'localStorage', {
            value: storage,
            configurable: true,
            writable: true
        });
    }
}

ensureLocalStorage();
