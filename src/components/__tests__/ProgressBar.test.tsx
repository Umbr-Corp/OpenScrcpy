import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ProgressBar from '../ProgressBar';

describe('ProgressBar', () => {
    it('exposes a labelled determinate bar with its detail line', () => {
        render(<ProgressBar value={42} label="Downloading" detail="12.4/28.6 MB" />);
        const bar = screen.getByRole('progressbar', { name: 'Downloading' });
        expect(bar).toHaveAttribute('aria-valuenow', '42');
        expect(bar).toHaveAttribute('aria-valuemin', '0');
        expect(bar).toHaveAttribute('aria-valuemax', '100');
        expect(screen.getByText('12.4/28.6 MB')).toBeInTheDocument();
    });

    it('clamps out-of-range values so bad input cannot break layout or ARIA', () => {
        const { rerender } = render(<ProgressBar value={140} label="Over" />);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');

        rerender(<ProgressBar value={-3} label="Under" />);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    });

    it('omits the detail line when none is provided', () => {
        const { container } = render(<ProgressBar value={10} label="Quiet" variant="compact" />);
        expect(container.querySelector('.ds-caption')).toBeNull();
    });
});
