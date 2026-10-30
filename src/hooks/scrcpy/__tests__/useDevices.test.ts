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

describe('useDevices — poll latch and selection', () => {
    beforeEach(() => {
        mockInvoke.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts a new poll after a failed one settles', async () => {
        vi.useFakeTimers();
        let getDevicesCalls = 0;
        let failFirst: ((reason: unknown) => void) | undefined;
        mockInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'get_devices') {
                getDevicesCalls += 1;
                if (getDevicesCalls === 1) {
                    return new Promise((_resolve, reject) => {
                        failFirst = reject;
                    });
                }
                return Promise.resolve({ error: false, devices: [] });
            }
            if (cmd === 'get_mdns_devices') return Promise.resolve({ error: false, services: [] });
            return Promise.resolve(null);
        });

        renderHook(() =>
            useDevices({
                historyDevices: [],
                addToHistory: vi.fn(),
                addLogs: vi.fn(),
            })
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(getDevicesCalls).toBe(1);

        // The single-flight latch must clear when the request settles, even
        // by rejection. If it stayed set, every later tick would join this
        // dead promise and the hub would never update again.
        await act(async () => {
            failFirst?.(new Error('adb hung'));
            await Promise.resolve();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(getDevicesCalls).toBe(2);
    });

    it('moves the selection off a device that disconnects', async () => {
        let currentDevices = ['device1', 'device2'];
        mockInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'get_devices') return Promise.resolve({ error: false, devices: currentDevices });
            if (cmd === 'get_mdns_devices') return Promise.resolve({ error: false, services: [] });
            return Promise.resolve(null);
        });

        const { result } = renderHook(() =>
            useDevices({
                historyDevices: [],
                addToHistory: vi.fn(),
                addLogs: vi.fn(),
            })
        );

        await act(async () => {
            await result.current.refreshDevices();
        });
        expect(result.current.activeDevice).toBe('device1');

        act(() => {
            result.current.setActiveDevice('device2');
        });
        currentDevices = ['device1'];
        await act(async () => {
            await result.current.refreshDevices();
        });
        expect(result.current.activeDevice).toBe('device1');

        currentDevices = [];
        await act(async () => {
            await result.current.refreshDevices();
        });
        expect(result.current.activeDevice).toBe('');
    });
});
