import { render, screen } from '@testing-library/react';
import ThemedModal from '../ThemedModal';
import { describe, it, expect } from 'vitest';

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

    it('hides the action footer while the download bar is on screen', () => {
        render(
            <ThemedModal
                isOpen
                onClose={() => {}}
                title="Downloading…"
                message="Downloading update… 42%"
                progress={42}
                actionLabel="OK"
                showCancel
            />
        );
        // Mid-download buttons mean nothing: OK closes the modal, Cancel
        // suggests an abort the updater plugin cannot actually perform. The
        // X (also labelled Cancel) stays as the only exit; the footer has none.
        expect(screen.queryByRole('button', { name: 'OK' })).toBeNull();
        expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
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
        // Two Cancel-named buttons: the corner X and the footer button.
        expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(2);
    });
});
