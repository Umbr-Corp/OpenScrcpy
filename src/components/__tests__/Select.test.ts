import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import Select from '../Select.svelte';

const options = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'cherry', label: 'Cherry' }
];

describe('Select', () => {
    it('opens the listbox and commits a clicked option', async () => {
        const onChange = vi.fn();
        render(Select, { props: { value: 'apple', onChange, options } });

        await fireEvent.click(screen.getByRole('combobox', { name: 'Apple' }));
        expect(screen.getByRole('listbox')).toBeInTheDocument();

        await fireEvent.click(screen.getByRole('option', { name: 'Banana' }));
        expect(onChange).toHaveBeenCalledWith('banana');
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('supports keyboard navigation and selection', async () => {
        const onChange = vi.fn();
        render(Select, { props: { value: 'apple', onChange, options } });

        const trigger = screen.getByRole('combobox', { name: 'Apple' });
        trigger.focus();
        await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        await fireEvent.keyDown(trigger, { key: 'Enter' });

        expect(onChange).toHaveBeenCalledWith('banana');
    });

    it('closes on Escape without changing the value', async () => {
        const onChange = vi.fn();
        render(Select, { props: { value: 'apple', onChange, options } });

        const trigger = screen.getByRole('combobox', { name: 'Apple' });
        await fireEvent.click(trigger);
        await fireEvent.keyDown(trigger, { key: 'Escape' });

        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });
});
