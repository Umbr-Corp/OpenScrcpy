import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDevices } from '../useDevices';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('../../../i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

function adbConnectCalls() {
    return mockInvoke.mock.calls.filter(([cmd]) => cmd === 'adb_connect').length;
}

describe('useDevices — history reconnect', () => {
    beforeEach(() => {
        mockInvoke.mockReset();
        mockInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'get_devices') return Promise.resolve({ error: false, devices: [] });
            if (cmd === 'get_mdns_devices') return Promise.resolve({ error: false, services: [] });
            return Promise.resolve(null);
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('does not start a second adb_connect while the first one is in flight', async () => {
        vi.useFakeTimers();
        let resolveConnect: (value: unknown) => void = () => {};
        mockInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'adb_connect') {
                return new Promise(resolve => {
                    resolveConnect = resolve;
                });
            }
            if (cmd === 'get_devices') return Promise.resolve({ error: false, devices: [] });
            if (cmd === 'get_mdns_devices') return Promise.resolve({ error: false, services: [] });
            return Promise.resolve(null);
        });

        renderHook(() =>
            useDevices({
                historyDevices: ['192.168.0.50:5555'],
                addToHistory: vi.fn(),
                addLogs: vi.fn(),
            })
        );

        expect(adbConnectCalls()).toBe(1);

        await act(async () => {
            vi.advanceTimersByTime(25_000);
        });
        expect(adbConnectCalls()).toBe(1);

        await act(async () => {
            resolveConnect({ success: true });
            await Promise.resolve();
        });

        await act(async () => {
            vi.advanceTimersByTime(25_000);
        });
        expect(adbConnectCalls()).toBe(2);
    });
});
