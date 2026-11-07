import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import ModalHarness from '../../test/fixtures/ModalHarness.svelte';

describe('Modal', () => {
    it('renders a labelled dialog and focuses the first control', () => {
        render(ModalHarness, { props: { onClose: vi.fn() } });

        expect(screen.getByRole('dialog', { name: 'Test dialog' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Inside' })).toHaveFocus();
    });

    it('closes on Escape', async () => {
        const onClose = vi.fn();
        render(ModalHarness, { props: { onClose } });

        await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('traps Tab inside the dialog', async () => {
        render(ModalHarness, { props: { onClose: vi.fn() } });

        const first = screen.getByRole('button', { name: 'Inside' });
        const second = screen.getByRole('button', { name: 'Second' });
        second.focus();
        await fireEvent.keyDown(second, { key: 'Tab' });

        expect(first).toHaveFocus();
    });
});
