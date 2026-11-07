import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scrcpy, DEFAULT_CONFIG } from '../scrcpy.svelte';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(() => Promise.resolve(() => {}))
}));
vi.mock('@tauri-apps/api/app', () => ({
    getVersion: vi.fn(() => Promise.resolve('2.0.0'))
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

function resetStore() {
    scrcpy.config = { ...DEFAULT_CONFIG };
    scrcpy.logs = [];
    scrcpy.devices = [];
    scrcpy.deviceModels = {};
    scrcpy.deviceFriendlyNames = {};
    scrcpy.unavailableDevices = [];
    scrcpy.mdnsDevices = [];
    scrcpy.activeDevice = '';
    scrcpy.runningDevices = [];
    scrcpy.isRefreshing = false;
    scrcpy.isStarting = false;
    scrcpy.scrcpyStatus = { found: false, message: '' };
    scrcpy.renderDriverSupport = {
        hostOs: 'unknown',
        supportsRenderDriver: false,
        supportedDrivers: []
    };
    scrcpy.isDownloading = false;
    scrcpy.downloadError = null;
    scrcpy.isOnboardingOpen = false;
}

describe('scrcpy store — integration', () => {
    beforeEach(() => {
        localStorage.clear();
        mockInvoke.mockReset();
        resetStore();
    });

    it('guards against a second concurrent start', async () => {
        scrcpy.setActiveDevice('device1');
        let finish!: (value: unknown) => void;
        mockInvoke.mockImplementation((command: string) => {
            if (command === 'run_scrcpy') {
                return new Promise(resolve => {
                    finish = resolve;
                });
            }
            return Promise.resolve(null);
        });

        const first = scrcpy.startSession();
        const second = scrcpy.startSession();

        expect(mockInvoke.mock.calls.filter(([cmd]) => cmd === 'run_scrcpy')).toHaveLength(1);
        expect(scrcpy.isStarting).toBe(true);

        finish(null);
        await Promise.all([first, second]);

        expect(scrcpy.isStarting).toBe(false);
    });

    it('guards against a second concurrent download', async () => {
        let finish!: (value: unknown) => void;
        mockInvoke.mockImplementation((command: string) => {
            if (command === 'download_scrcpy') {
                return new Promise(resolve => {
                    finish = resolve;
                });
            }
            return Promise.resolve(null);
        });

        const first = scrcpy.downloadScrcpy();
        const second = scrcpy.downloadScrcpy();

        expect(mockInvoke.mock.calls.filter(([cmd]) => cmd === 'download_scrcpy')).toHaveLength(1);
        expect(scrcpy.isDownloading).toBe(true);

        finish(null);
        await Promise.all([first, second]);
    });

    it('updates binary status and render drivers after a successful check', async () => {
        mockInvoke.mockImplementation((command: string) => {
            if (command === 'check_scrcpy') return Promise.resolve({ found: true, message: 'ok' });
            if (command === 'get_render_drivers') {
                return Promise.resolve({
                    hostOs: 'linux',
                    supportsRenderDriver: true,
                    supportedDrivers: [{ id: 'opengl', label: 'OpenGL' }]
                });
            }
            return Promise.resolve(null);
        });

        await expect(scrcpy.checkScrcpy()).resolves.toBe(true);
        expect(scrcpy.scrcpyStatus).toEqual({ found: true, message: 'ok' });
        expect(scrcpy.renderDriverSupport.supportsRenderDriver).toBe(true);
        expect(scrcpy.renderDriverSupport.supportedDrivers).toEqual([
            { id: 'opengl', label: 'OpenGL' }
        ]);
    });

    it('loads devices, unavailable transports and mDNS records', async () => {
        mockInvoke.mockImplementation((command: string) => {
            if (command === 'get_devices') {
                return Promise.resolve({
                    devices: ['usb1'],
                    deviceModels: { usb1: 'Pixel 7' },
                    unavailable: [{ serial: 'usb2', state: 'offline' }]
                });
            }
            if (command === 'get_mdns_devices') {
                return Promise.resolve({
                    services: [
                        {
                            name: 'adb-Phone',
                            service: '_adb-tls-connect._tcp',
                            address: '192.168.0.5:5555'
                        }
                    ]
                });
            }
            return Promise.resolve({ success: false });
        });

        await scrcpy.refreshDevices();

        expect(scrcpy.devices).toEqual(['usb1']);
        expect(scrcpy.deviceModels.usb1).toBe('Pixel 7');
        expect(scrcpy.unavailableDevices).toEqual([{ serial: 'usb2', state: 'offline' }]);
        expect(scrcpy.mdnsDevices).toHaveLength(1);
        expect(scrcpy.mdnsDevices[0].address).toBe('192.168.0.5:5555');
    });
});
