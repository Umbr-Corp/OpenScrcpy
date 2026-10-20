import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Modal from '../Modal';
import ThemedModal from '../ThemedModal';

describe('Modal', () => {
    it('closes with Escape', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<Modal isOpen onClose={onClose} label="Dialog"><button>Hi</button></Modal>);
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on backdrop click when allowed', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<Modal isOpen onClose={onClose} label="Dialog"><button>Hi</button></Modal>);
        await user.click(document.querySelector('.absolute.inset-0') as HTMLElement);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps backdrop clicks from closing when closeOnBackdrop is off', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<Modal isOpen onClose={onClose} closeOnBackdrop={false} label="Dialog"><button>Hi</button></Modal>);
        await user.click(document.querySelector('.absolute.inset-0') as HTMLElement);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('keeps the dialog open on Escape when closeOnEscape is off', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<Modal isOpen onClose={onClose} closeOnEscape={false} label="Dialog"><button>Hi</button></Modal>);
        await user.keyboard('{Escape}');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('focuses the data-autofocus target instead of the first focusable', () => {
        render(
            <Modal isOpen onClose={() => { }} label="Focus">
                <button>Close</button>
                <button data-autofocus>Primary</button>
            </Modal>
        );
        expect(screen.getByText('Primary')).toHaveFocus();
    });

    it('traps Tab focus inside the dialog', async () => {
        const user = userEvent.setup();
        render(
            <Modal isOpen onClose={() => { }} label="Trap">
                <button>First</button>
                <button>Middle</button>
                <button>Last</button>
            </Modal>
        );
        const buttons = screen.getAllByRole('button');
        // Modal's initial focus is the first focusable; Tab from Last wraps to First.
        buttons[buttons.length - 1].focus();
        await user.keyboard('{Tab}');
        expect(document.activeElement).toBe(buttons[0]);
    });

    it('restores focus to the opener after closing', async () => {
        const user = userEvent.setup();
        function Harness() {
            const [open, setOpen] = useState(false);
            return (
                <>
                    <button onClick={() => setOpen(true)}>Open</button>
                    {open && (
                        <Modal isOpen onClose={() => setOpen(false)} label="D">
                            <button onClick={() => setOpen(false)}>Close</button>
                        </Modal>
                    )}
                </>
            );
        }
        render(<Harness />);
        await user.click(screen.getByText('Open'));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await user.click(screen.getByText('Close'));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByText('Open')).toHaveFocus();
    });
});

describe('ThemedModal', () => {
    function renderModal(onClose = vi.fn(), props = {}) {
        return render(
            <ThemedModal
                isOpen
                onClose={onClose}
                title="Something happened"
                message="Details about it."
                kind="error"
                actionLabel="Redo"
                showCancel
                cancelLabel="Abort"
                {...props}
            />
        );
    }

    it('closes with Escape', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderModal(onClose);
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('backs the cancel action with onClose and onCancel', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const onCancel = vi.fn();
        renderModal(onClose, { onCancel });
        await user.click(screen.getByText('Abort'));
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('runs the primary action then closes', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const onAction = vi.fn();
        renderModal(onClose, { onAction });
        await user.click(screen.getByText('Redo'));
        expect(onAction).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
