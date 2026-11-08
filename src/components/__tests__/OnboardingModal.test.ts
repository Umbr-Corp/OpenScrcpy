import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import OnboardingModal from '../OnboardingModal.svelte';

function baseProps(overrides: Record<string, unknown> = {}) {
    return {
        isOpen: true,
        onClose: vi.fn(),
        binaryStatus: { found: false, message: 'missing' },
        onDownload: vi.fn(),
        isDownloading: false,
        downloadProgress: 0,
        onComplete: vi.fn(),
        ...overrides
    };
}

describe('OnboardingModal', () => {
    it('shows the download error and starts the download', async () => {
        const onDownload = vi.fn();
        render(OnboardingModal, {
            props: baseProps({ onDownload, downloadError: 'network down' })
        });

        expect(screen.getByRole('alert')).toHaveTextContent('network down');
        await fireEvent.click(screen.getByRole('button', { name: /Download core binaries/i }));
        expect(onDownload).toHaveBeenCalledTimes(1);
    });

    it('enables continue only after the binaries are found', async () => {
        const onComplete = vi.fn();
        const view = render(OnboardingModal, { props: baseProps({ onComplete }) });

        const before = screen.getByRole('button', { name: /Continue/i });
        expect(before).toBeDisabled();

        await view.rerender(
            baseProps({
                onComplete,
                binaryStatus: { found: true, message: 'ready' }
            })
        );

        const after = screen.getByRole('button', { name: /Continue/i });
        expect(after).not.toBeDisabled();
        await fireEvent.click(after);
        expect(onComplete).toHaveBeenCalledTimes(1);
    });
});
