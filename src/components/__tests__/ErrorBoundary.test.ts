import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import BoundaryHarness from '../../test/fixtures/BoundaryHarness.svelte';

describe('ErrorBoundary', () => {
    afterEach(() => vi.restoreAllMocks());

    it('renders the recovery UI when a child throws', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});

        render(BoundaryHarness, { props: { shouldThrow: true } });

        expect(screen.getByText('System Breach Detected')).toBeInTheDocument();
        expect(screen.getByText('boom')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reboot' })).toBeInTheDocument();
    });

    it('renders children when nothing throws', () => {
        render(BoundaryHarness, { props: { shouldThrow: false } });

        expect(screen.getByText('safe content')).toBeInTheDocument();
        expect(screen.queryByText('System Breach Detected')).not.toBeInTheDocument();
    });
});
