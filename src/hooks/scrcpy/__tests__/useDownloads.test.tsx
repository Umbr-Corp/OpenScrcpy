import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDownloads } from '../useDownloads';
import { closeAlert, getAlertSnapshot } from '../../../alerts';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockIsTauri = vi.hoisted(() => vi.fn(() => true));
const mockListen = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mockListen }));
vi.mock('../../../tauri', () => ({ isTauri: mockIsTauri }));
vi.mock('../../../i18n', () => ({
    useI18n: () => ({ t: (key: string) => key })
}));

function renderDownloads(onDownloadComplete = vi.fn()) {
    return renderHook(() =>
        useDownloads({
            addLogs: vi.fn(),
            onDownloadComplete
        })
    );
}

function emitStatus(payload: unknown) {
    const calls = mockListen.mock.calls;
    const call = calls[calls.length - 1];
    call?.[1]?.({ payload });
}

function backendResponse(checkResult: unknown) {
    mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'check_scrcpy') return Promise.resolve(checkResult);
        if (cmd === 'get_render_drivers') {
            return Promise.resolve({ hostOs: 'linux', supportsRenderDriver: true, supportedDrivers: [] });
        }
        return Promise.resolve(null);
    });
}

describe('useDownloads — auto-onboarding gate', () => {
    beforeEach(() => {
        mockInvoke.mockReset();
        mockListen.mockReset();
        mockListen.mockImplementation(() => Promise.resolve(() => {}));
        localStorage.clear();
    });

    it('opens onboarding on first run when the bundle is missing', async () => {
        backendResponse({ found: false, message: 'missing' });
        const { result } = renderDownloads();

        await act(async () => {
            await result.current.checkScrcpy();
        });

        expect(result.current.isOnboardingOpen).toBe(true);
    });

    it('does not reopen onboarding once setup was completed', async () => {
        localStorage.setItem('scrcpy_onboarding_done', 'true');
        backendResponse({ found: false, message: 'missing' });
        const { result } = renderDownloads();

        await act(async () => {
            await result.current.checkScrcpy();
        });

        expect(result.current.isOnboardingOpen).toBe(false);
    });

    it('never auto-opens when the bundle is found', async () => {
        backendResponse({ found: true, message: 'ok' });
        const { result } = renderDownloads();

        await act(async () => {
            await result.current.checkScrcpy();
        });

        expect(result.current.isOnboardingOpen).toBe(false);
        expect(result.current.scrcpyStatus.found).toBe(true);
    });

    it('keeps the modal closed when check_scrcpy fails entirely', async () => {
        mockInvoke.mockRejectedValue(new Error('boom'));
        const { result } = renderDownloads();

        await act(async () => {
            await result.current.checkScrcpy();
        });

        expect(result.current.isOnboardingOpen).toBe(false);
        expect(result.current.scrcpyStatus.found).toBe(false);
    });

    it('completeOnboarding persists the done flag and closes the modal', async () => {
        backendResponse({ found: false, message: 'missing' });
        const { result } = renderDownloads();

        await act(async () => {
            await result.current.checkScrcpy();
        });
        act(() => {
            result.current.completeOnboarding();
        });

        expect(localStorage.getItem('scrcpy_onboarding_done')).toBe('true');
        expect(result.current.isOnboardingOpen).toBe(false);
    });
});

describe('useDownloads — download events', () => {
    beforeEach(() => {
        mockInvoke.mockReset();
        mockListen.mockReset();
        mockListen.mockImplementation(() => Promise.resolve(() => {}));
        localStorage.clear();
        closeAlert();
    });

    it('updates progress from a scrcpy-status download-progress event', () => {
        backendResponse({ found: true, message: 'ok' });
        const { result } = renderDownloads();

        act(() => {
            emitStatus({ type: 'download-progress', percent: 42 });
        });

        expect(result.current.downloadProgress).toBe(42);
    });

    it('closes the downloading state and calls the settle callback on download-complete', () => {
        const onDownloadComplete = vi.fn();
        backendResponse({ found: true, message: 'ok' });
        const { result } = renderDownloads(onDownloadComplete);

        act(() => {
            emitStatus({ type: 'downloading', message: 'Fetching' });
        });
        expect(result.current.isDownloading).toBe(true);

        act(() => {
            emitStatus({ type: 'download-complete', message: '/app/scrcpy-bin' });
        });

        expect(result.current.isDownloading).toBe(false);
        expect(onDownloadComplete).toHaveBeenCalledWith('/app/scrcpy-bin');
    });

    it('ignores a second download while the first is still in flight', async () => {
        let finishDownload!: (value: unknown) => void;
        mockInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'download_scrcpy') {
                return new Promise((resolve) => {
                    finishDownload = resolve;
                });
            }
            return Promise.resolve(null);
        });
        const { result } = renderDownloads();

        act(() => {
            void result.current.downloadScrcpy();
            void result.current.downloadScrcpy();
        });

        expect(
            mockInvoke.mock.calls.filter(([cmd]) => cmd === 'download_scrcpy')
        ).toHaveLength(1);

        await act(async () => {
            finishDownload(null);
        });
    });

    it('shows an app alert when a download fails outside onboarding', async () => {
        mockInvoke.mockImplementation((cmd: string) => {
            if (cmd === 'download_scrcpy') return Promise.reject(new Error('offline'));
            return Promise.resolve(null);
        });
        const { result } = renderDownloads();

        await act(async () => {
            await result.current.downloadScrcpy();
        });

        expect(result.current.downloadError).toBe('onboarding.downloadFailed');
        expect(getAlertSnapshot()).toMatchObject({
            isOpen: true,
            title: 'alerts.downloadFailedTitle',
            message: 'onboarding.downloadFailed',
        });
    });
});
