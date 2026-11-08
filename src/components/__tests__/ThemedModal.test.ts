import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import ThemedModal from '../ThemedModal.svelte';

describe('ThemedModal', () => {
    it('shows a progress bar and hides the footer actions mid-download', () => {
        render(ThemedModal, {
            props: {
                isOpen: true,
                onClose: vi.fn(),
                title: 'Downloading',
                message: '42%',
                progress: 42,
                progressDetail: '12/28 MB',
                actionLabel: 'OK',
                showCancel: true
            }
        });

        expect(screen.getByRole('progressbar', { name: 'Downloading' })).toBeInTheDocument();
        expect(screen.getByText('12/28 MB')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'OK' })).not.toBeInTheDocument();
    });

    it('runs the action and closes', async () => {
        const onAction = vi.fn();
        const onClose = vi.fn();
        render(ThemedModal, {
            props: {
                isOpen: true,
                onClose,
                title: 'Confirm',
                message: 'Continue?',
                actionLabel: 'Go',
                onAction
            }
        });

        await fireEvent.click(screen.getByRole('button', { name: 'Go' }));

        expect(onAction).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('uses the eyebrow instead of the kind label', () => {
        render(ThemedModal, {
            props: {
                isOpen: true,
                onClose: vi.fn(),
                title: 'Update',
                message: 'Notes',
                eyebrow: 'v1 → v2'
            }
        });

        expect(screen.getByText('v1 → v2')).toBeInTheDocument();
        expect(screen.queryByText('Info')).not.toBeInTheDocument();
    });
});
