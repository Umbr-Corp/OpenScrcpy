import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemedModal from '../ThemedModal';
import { describe, it, expect, vi } from 'vitest';

describe('ThemedModal', () => {
    it('renders a determinate download bar with its bytes caption', () => {
        render(
            <ThemedModal
                isOpen
                onClose={() => {}}
                title="Downloading…"
                message="Downloading update… 42%"
                progress={42}
                progressDetail="12.4/28.6 MB"
            />
        );
        const bar = screen.getByRole('progressbar');
        expect(bar).toHaveAttribute('aria-valuenow', '42');
        expect(bar).toHaveAttribute('aria-valuemax', '100');
        expect(screen.getByText('12.4/28.6 MB')).toBeInTheDocument();
    });

    it('hides every exit while the download bar is on screen', () => {
        const onClose = vi.fn();
        render(
            <ThemedModal
                isOpen
                onClose={onClose}
                title="Downloading…"
                message="Downloading update… 42%"
                progress={42}
                actionLabel="OK"
                showCancel
            />
        );
        // Mid-download buttons mean nothing: OK closes the modal, Cancel
        // suggests an abort the updater plugin cannot perform, and closing
        // would hide the progress while the app still restarts at the end.
        expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('does not close mid-download on Escape or backdrop click', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(
            <ThemedModal
                isOpen
                onClose={onClose}
                title="Downloading…"
                message="Downloading update… 42%"
                progress={42}
                actionLabel="OK"
                showCancel
            />
        );
        await user.keyboard('{Escape}');
        await user.click(document.querySelector('.absolute.inset-0') as HTMLElement);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('links the message to the dialog as its description', () => {
        render(
            <ThemedModal
                isOpen
                onClose={() => {}}
                title="Something happened"
                message="Details about it."
            />
        );
        const dialog = screen.getByRole('dialog');
        const describedBy = dialog.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        expect(document.getElementById(describedBy!)).toHaveTextContent('Details about it.');
    });

    it('replaces the kind chip with a caller-provided eyebrow', () => {
        render(
            <ThemedModal
                isOpen
                onClose={() => {}}
                title="New Version Available"
                message="Release notes"
                eyebrow="v1.1.5 → v1.1.6"
            />
        );
        expect(screen.getByText('v1.1.5 → v1.1.6')).toBeInTheDocument();
        expect(screen.queryByText('Info')).toBeNull();
    });

    it('keeps the action footer for regular alerts without progress', () => {
        render(
            <ThemedModal
                isOpen
                onClose={() => {}}
                title="Updated"
                message="Restarting…"
                actionLabel="OK"
                showCancel
            />
        );
        expect(screen.queryByRole('progressbar')).toBeNull();
        expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
        // Footer Cancel plus the corner X (announced as "Close", not "Cancel").
        expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
        expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    });
});
