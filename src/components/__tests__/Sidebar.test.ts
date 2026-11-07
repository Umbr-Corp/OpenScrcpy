import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Sidebar from '../Sidebar.svelte';
import { scrcpy, DEFAULT_CONFIG } from '../../lib/scrcpy.svelte';
import { setLocale } from '../../i18n';

describe('Sidebar', () => {
    beforeEach(async () => {
        await setLocale('en');
        scrcpy.config = { ...DEFAULT_CONFIG };
        scrcpy.devices = [];
        scrcpy.deviceModels = {};
        scrcpy.deviceFriendlyNames = {};
        scrcpy.unavailableDevices = [];
        scrcpy.runningDevices = [];
        scrcpy.activeDevice = '';
        scrcpy.historyDevices = [];
        scrcpy.mdnsDevices = [];
        scrcpy.isRefreshing = false;
    });

    it('renders devices and selects one on click', async () => {
        scrcpy.devices = ['usb1'];
        scrcpy.deviceModels = { usb1: 'Pixel 7' };
        render(Sidebar);

        expect(screen.getByText('Pixel 7')).toBeInTheDocument();
        await fireEvent.click(screen.getByText('Pixel 7'));
        expect(scrcpy.activeDevice).toBe('usb1');
    });

    it('shows unauthorized and offline transports', () => {
        scrcpy.unavailableDevices = [
            { serial: 'usb2', state: 'unauthorized', model: 'Pixel 8' }
        ];
        render(Sidebar);

        expect(screen.getByText('Pixel 8')).toBeInTheDocument();
        expect(screen.getByText('Authorize on the device')).toBeInTheDocument();
    });
});
