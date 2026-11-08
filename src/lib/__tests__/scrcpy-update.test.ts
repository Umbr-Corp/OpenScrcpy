import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scrcpy } from '../scrcpy.svelte';
import { alert, closeAlert } from '../alerts.svelte';
import { setLocale, t } from '../../i18n';

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }));
vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn(() => Promise.resolve(() => {}))
}));
vi.mock('@tauri-apps/api/app', () => ({
    getVersion: vi.fn(() => Promise.resolve('2.0.0'))
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

describe('scrcpy update check', () => {
    beforeEach(async () => {
        await setLocale('en');
        closeAlert();
        mockInvoke.mockReset();
        scrcpy.scrcpyStatus = { found: true, message: 'ok' };
        scrcpy.isDownloading = false;
        scrcpy.config = { ...scrcpy.config, scrcpyPath: undefined };
    });

    it('shows an alert when a newer scrcpy is available', async () => {
        mockInvoke.mockResolvedValue({
            update_available: true,
            local_version: '2.0.0',
            latest_version: '2.1.0'
        });

        await scrcpy.checkScrcpyUpdate();

        expect(alert.isOpen).toBe(true);
        expect(alert.title).toBe(t('alerts.updateAvailableTitle'));
        expect(alert.message).toContain('2.1.0');
    });
});
