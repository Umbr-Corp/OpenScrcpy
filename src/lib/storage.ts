/** Defensive localStorage helpers. Storage can throw in private mode, when the
 *  quota is full, or when the webview disables it; none of those should break
 *  the UI. */
let storageWarned = false;

function warnOnce(error: unknown) {
    if (storageWarned) return;
    storageWarned = true;
    console.warn('localStorage unavailable; changes stay in memory for this session.', error);
}

export function safeGetItem(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        warnOnce(e);
        return null;
    }
}

export function safeSetItem(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        warnOnce(e);
    }
}

export function safeRemoveItem(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        warnOnce(e);
    }
}

export function loadStoredJSON<T>(key: string, fallback: T): T {
    try {
        const raw = safeGetItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch (e) {
        console.error(`Failed to parse ${key}`, e);
        return fallback;
    }
}

/** Snapshot for diagnostics. An allowlist keeps device history and custom
 *  paths out of reports unless explicitly requested. */
export function storageSnapshot(allowlist?: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    try {
        if (allowlist) {
            for (const key of allowlist) {
                const value = safeGetItem(key);
                if (value !== null) out[key] = value;
            }
            return out;
        }
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) out[key] = safeGetItem(key) ?? '';
        }
    } catch (e) {
        warnOnce(e);
    }
    return out;
}
