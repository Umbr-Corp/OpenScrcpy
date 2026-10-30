import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersistedConfig } from '../usePersistedConfig';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));

describe('usePersistedConfig — blocked storage', () => {
    beforeEach(() => {
        localStorage.clear();
        mockInvoke.mockReset();
        mockInvoke.mockResolvedValue('/videos');
        window.matchMedia = vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps the in-memory state when localStorage writes throw', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('quota exceeded', 'QuotaExceededError');
        });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const { result } = renderHook(() => usePersistedConfig());
        await act(async () => {});

        act(() => result.current.setColorMode('dark'));
        act(() => result.current.addToHistory('192.168.0.10:5555'));

        expect(result.current.colorMode).toBe('dark');
        expect(result.current.historyDevices).toEqual(['192.168.0.10:5555']);
        expect(warn).toHaveBeenCalledTimes(1);
    });
});
