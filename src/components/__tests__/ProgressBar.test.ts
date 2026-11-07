import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProgressBar from '../ProgressBar.svelte';

describe('ProgressBar', () => {
    it('clamps the value and exposes ARIA attributes', () => {
        render(ProgressBar, { props: { value: 142, label: 'Progress' } });

        const bar = screen.getByRole('progressbar', { name: 'Progress' });
        expect(bar.getAttribute('aria-valuenow')).toBe('100');
        expect(bar.getAttribute('aria-valuemin')).toBe('0');
        expect(bar.getAttribute('aria-valuemax')).toBe('100');
    });

    it('shows the detail caption', () => {
        render(ProgressBar, {
            props: { value: 42, label: 'Download', detail: '12.4/28.6 MB' }
        });

        expect(screen.getByText('12.4/28.6 MB')).toBeInTheDocument();
    });
});
