import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import SliderRow from '../SliderRow.svelte';

describe('SliderRow', () => {
    it('commits the draft value only on release', async () => {
        const onChange = vi.fn();
        render(SliderRow, {
            props: { label: 'Bitrate', value: 8, min: 1, max: 50, onChange }
        });

        const slider = screen.getByRole('slider', { name: 'Bitrate' });
        await fireEvent.input(slider, { target: { value: '12' } });
        expect(onChange).not.toHaveBeenCalled();

        await fireEvent.mouseUp(slider);
        expect(onChange).toHaveBeenCalledWith(12);
    });
});
