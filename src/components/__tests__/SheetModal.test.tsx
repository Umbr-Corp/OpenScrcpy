import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import SheetModal from '../SheetModal';

describe('SheetModal', () => {
    it('uses the title as heading and dialog name, and wires the close X', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(
            <SheetModal isOpen onClose={onClose} title="Manual setup">
                <p>Body</p>
            </SheetModal>
        );

        expect(screen.getByRole('dialog', { name: 'Manual setup' })).toHaveTextContent('Body');
        expect(screen.getByRole('heading', { name: 'Manual setup' })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('renders the footer and honors the initial focus ref over the footer button', () => {
        const inputRef = createRef<HTMLInputElement>();
        render(
            <SheetModal
                isOpen
                onClose={() => { }}
                title="Pair device"
                initialFocusRef={inputRef}
                footer={<button>Submit</button>}
            >
                <input ref={inputRef} aria-label="Pairing code" />
            </SheetModal>
        );

        expect(screen.getByLabelText('Pairing code')).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    });

    it('renders nothing while closed', () => {
        render(
            <SheetModal isOpen={false} onClose={() => { }} title="Hidden">
                <p>Body</p>
            </SheetModal>
        );
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
