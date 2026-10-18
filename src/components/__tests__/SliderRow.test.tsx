import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SliderRow from '../SliderRow';

describe('SliderRow', () => {
    it('holds the draft locally and commits only on release', () => {
        const onChange = vi.fn();
        render(
            <SliderRow
                label="Bitrate"
                value={8}
                min={1}
                max={50}
                format={(v) => `${v}M`}
                onChange={onChange}
            />
        );

        const slider = screen.getByRole('slider', { name: 'Bitrate' });
        fireEvent.change(slider, { target: { value: '20' } });

        // Readout follows the draft, parent hears nothing yet.
        expect(screen.getByText('20M')).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();

        fireEvent.mouseUp(slider);
        expect(onChange).toHaveBeenCalledWith(20);
    });

    it('commits on keyboard nudges (key up)', () => {
        const onChange = vi.fn();
        render(
            <SliderRow label="DPI" value={420} min={120} max={640} onChange={onChange} />
        );

        const slider = screen.getByRole('slider', { name: 'DPI' });
        fireEvent.change(slider, { target: { value: '480' } });
        fireEvent.keyUp(slider);
        expect(onChange).toHaveBeenCalledWith(480);
    });
});
