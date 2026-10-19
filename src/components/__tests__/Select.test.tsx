import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Select from '../Select';

const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' }
];

function renderSelect(onChange = vi.fn(), props = {}) {
    return render(
        <Select
            value="a"
            onChange={onChange}
            options={options}
            label="Pick one"
            {...props}
        />
    );
}

describe('Select', () => {
    it('opens on click and renders the options as a listbox', async () => {
        const user = userEvent.setup();
        renderSelect();
        await user.click(screen.getByText('Alpha'));
        expect(screen.getByRole('listbox')).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Gamma' })).toBeInTheDocument();
    });

    it('commits the highlighted option with Enter', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderSelect(onChange);
        await user.click(screen.getByText('Alpha'));
        await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
        expect(onChange).toHaveBeenCalledWith('c');
    });

    it('closes with Escape and keeps the current value', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderSelect(onChange);
        await user.click(screen.getByText('Alpha'));
        await user.keyboard('{Escape}');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('tracks the highlighted option via aria-activedescendant', async () => {
        const user = userEvent.setup();
        renderSelect();
        const trigger = screen.getByRole('button', { name: 'Alpha' });
        await user.click(trigger);
        await user.keyboard('{ArrowDown}');
        expect(trigger).toHaveAttribute('aria-activedescendant', expect.stringContaining('-opt-1'));
    });

    it('wraps the highlight past both ends', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        renderSelect(onChange);
        await user.click(screen.getByText('Alpha'));
        await user.keyboard('{ArrowUp}{Enter}');
        expect(onChange).toHaveBeenCalledWith('c');
    });

    it('keeps focus on the trigger while highlight moves', async () => {
        const user = userEvent.setup();
        renderSelect();
        const trigger = screen.getByRole('button', { name: 'Alpha' });
        await user.click(trigger);
        await user.keyboard('{ArrowDown}');
        expect(trigger).toHaveFocus();
    });

    it('carries the option value type through onChange (numbers stay numbers)', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <Select<number>
                value={60}
                onChange={onChange}
                options={[
                    { value: 30, label: '30' },
                    { value: 60, label: '60' }
                ]}
            />
        );
        await user.click(screen.getByRole('button'));
        await user.click(screen.getByRole('option', { name: '30' }));
        expect(onChange).toHaveBeenCalledWith(30);
        // Guard against the string/any coercion that used to hide this.
        expect(typeof onChange.mock.calls[0][0]).toBe('number');
    });
});
