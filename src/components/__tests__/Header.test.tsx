import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Header from '../Header';

const props = {
    colorMode: 'dark' as const,
    onColorModeChange: vi.fn(),
    binaryStatus: { found: true, message: '' },
    onDownload: vi.fn(),
    onSetPath: vi.fn(),
    onResetPath: vi.fn(),
    isDownloading: false,
    downloadProgress: 0,
    version: '1.1.6'
};

describe('Header popovers', () => {
    it('closes the language list with Escape and returns focus to the trigger', async () => {
        const user = userEvent.setup();
        render(<Header {...props} />);
        const trigger = screen.getByRole('button', { name: /^Language:/ });

        await user.click(trigger);
        expect(screen.getByRole('listbox')).toBeInTheDocument();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('listbox')).toBeNull();
        expect(trigger).toHaveFocus();
    });

    it('moves through language options with arrows, Home and End', async () => {
        const user = userEvent.setup();
        render(<Header {...props} />);
        const trigger = screen.getByRole('button', { name: /^Language:/ });

        await user.click(trigger);
        const options = screen.getAllByRole('option');

        await user.keyboard('{ArrowDown}');
        expect(options[0]).toHaveFocus();

        await user.keyboard('{ArrowDown}');
        expect(options[1]).toHaveFocus();

        await user.keyboard('{ArrowUp}');
        expect(options[0]).toHaveFocus();

        await user.keyboard('{End}');
        expect(options[options.length - 1]).toHaveFocus();

        await user.keyboard('{Home}');
        expect(options[0]).toHaveFocus();
    });

    it('opens the language list on ArrowDown and lands on the selected locale', async () => {
        const user = userEvent.setup();
        render(<Header {...props} />);
        const trigger = screen.getByRole('button', { name: /^Language:/ });

        trigger.focus();
        await user.keyboard('{ArrowDown}');

        expect(screen.getByRole('listbox')).toBeInTheDocument();
        expect(screen.getAllByRole('option')[0]).toHaveFocus();
    });

    it('closes the engine popover with Escape and returns focus to the trigger', async () => {
        const user = userEvent.setup();
        render(<Header {...props} />);
        const trigger = screen.getByRole('button', { name: /^Scrcpy Engine:/ });

        await user.click(trigger);
        expect(screen.getByRole('dialog', { name: 'Scrcpy Engine' })).toBeInTheDocument();

        await user.keyboard('{Escape}');
        expect(screen.queryByRole('dialog', { name: 'Scrcpy Engine' })).toBeNull();
        expect(trigger).toHaveFocus();
    });
});
