import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../useSession';
import type { ScrcpyConfig } from '../types';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockListen = vi.hoisted(() => vi.fn(() => Promise.resolve(() => {})));
const mockIsTauri = vi.hoisted(() => vi.fn(() => true));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }));
vi.mock('../../../tauri', () => ({ isTauri: mockIsTauri }));
vi.mock('../../../i18n', () => ({
    useI18n: () => ({ t: (key: string) => key })
}));

const config: ScrcpyConfig = { device: 'device1', sessionMode: 'mirror' };

function renderSession() {
    return renderHook(() =>
        useSession({ activeDevice: 'device1', addLogs: vi.fn() })
    );
}

function startCalls() {
    return mockInvoke.mock.calls.filter(([cmd]) => cmd === 'run_scrcpy');
}

describe('useSession — start guard', () => {
    beforeEach(() => {
        mockInvoke.mockReset();
        mockListen.mockClear();
        localStorage.clear();
    });

    it('starts only one scrcpy while the first invoke is in flight', async () => {
        let finish!: (value: unknown) => void;
        mockInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'run_scrcpy') {
                return new Promise((resolve) => {
                    finish = resolve;
                });
            }
            return Promise.resolve(null);
        });
        const { result } = renderSession();

        act(() => {
            void result.current.runScrcpy(config);
            void result.current.runScrcpy(config);
        });

        expect(startCalls()).toHaveLength(1);
        expect(result.current.isStarting).toBe(true);

        await act(async () => {
            finish(null);
        });
        expect(result.current.isStarting).toBe(false);
    });

    it('allows a new start after the previous invoke settles', async () => {
        mockInvoke.mockResolvedValue(null);
        const { result } = renderSession();

        await act(async () => {
            await result.current.runScrcpy(config);
        });
        await act(async () => {
            await result.current.runScrcpy(config);
        });

        expect(startCalls()).toHaveLength(2);
    });
});
