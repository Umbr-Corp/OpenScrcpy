import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDownloads } from '../useDownloads';

const mockInvoke = vi.hoisted(() => vi.fn());
const mockIsTauri = vi.hoisted(() => vi.fn(() => true));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(() => Promise.resolve(() => {}))
}));
vi.mock('../../../tauri', () => ({ isTauri: mockIsTauri }));
vi.mock('../../../i18n', () => ({
    useI18n: () => ({ t: (key: string) => key })
}));

function renderDownloads() {
    return renderHook(() =>
        useDownloads({
            addLogs: vi.fn(),
            onDownloadComplete: vi.fn()
        })
    );
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
