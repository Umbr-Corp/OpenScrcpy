import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Header from '../Header.svelte';
import { setLocale } from '../../i18n';

function props() {
    return {
        colorMode: 'system' as const,
        onColorModeChange: vi.fn(),
        binaryStatus: { found: true, message: 'Scrcpy Ready' },
        onDownload: vi.fn(),
        onSetPath: vi.fn(),
        onResetPath: vi.fn(),
        isDownloading: false,
        downloadProgress: 0,
        version: '2.0.0'
    };
}

describe('Header', () => {
    beforeEach(async () => {
        await setLocale('en');
    });

    it('renders the brand and engine status', () => {
        render(Header, { props: props() });

        expect(screen.getByText('V2.0.0')).toBeInTheDocument();
        expect(screen.getByLabelText(/Scrcpy Engine/)).toBeInTheDocument();
    });

    it('changes the color mode', async () => {
        const p = props();
        render(Header, { props: p });

        await fireEvent.click(screen.getByRole('tab', { name: 'Dark' }));
        expect(p.onColorModeChange).toHaveBeenCalledWith('dark');
    });

    it('opens the language menu', async () => {
        render(Header, { props: props() });

        await fireEvent.click(screen.getByLabelText('Language: en'));
        expect(screen.getByRole('listbox')).toBeInTheDocument();
    });
});
