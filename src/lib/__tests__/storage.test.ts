import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    loadStoredJSON,
    safeGetItem,
    safeRemoveItem,
    safeSetItem,
    storageSnapshot
} from '../storage';

describe('safe storage helpers', () => {
    beforeEach(() => localStorage.clear());
    afterEach(() => vi.restoreAllMocks());

    it('reads and writes values', () => {
        safeSetItem('key', 'value');
        expect(safeGetItem('key')).toBe('value');
        safeRemoveItem('key');
        expect(safeGetItem('key')).toBeNull();
    });

    it('falls back when JSON is corrupt', () => {
        safeSetItem('broken', '{not-json');
        expect(loadStoredJSON('broken', { ok: true })).toEqual({ ok: true });
    });

    it('does not throw when storage writes are blocked', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('quota exceeded', 'QuotaExceededError');
        });

        expect(() => safeSetItem('key', 'value')).not.toThrow();
    });

    it('exports only allowlisted keys', () => {
        safeSetItem('scrcpy_config', '{"x":1}');
        safeSetItem('scrcpy_history', '["private"]');
        safeSetItem('other', 'secret');

        expect(storageSnapshot(['scrcpy_config'])).toEqual({
            scrcpy_config: '{"x":1}'
        });
    });
});
