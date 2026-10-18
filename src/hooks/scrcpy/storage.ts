/** JSON blob from localStorage parsed defensively; corrupt values fall back
 *  instead of throwing during render. */
export function loadStoredJSON<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch (e) {
        console.error(`Failed to parse ${key}`, e);
        return fallback;
    }
}
