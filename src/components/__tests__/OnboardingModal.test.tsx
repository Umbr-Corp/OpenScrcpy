import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import OnboardingModal from '../OnboardingModal';

const baseProps = {
    isOpen: true,
    onClose: vi.fn(),
    binaryStatus: { found: false, message: 'Missing' },
    onDownload: vi.fn(),
    isDownloading: false,
    downloadProgress: 0,
    onComplete: vi.fn(),
};

describe('OnboardingModal', () => {
    it('surfaces a failed download inline', () => {
        render(<OnboardingModal {...baseProps} downloadError="Download failed. Try again." />);
        expect(screen.getByRole('alert')).toHaveTextContent('Download failed. Try again.');
    });

    it('exposes the core download progress to assistive tech', () => {
        render(<OnboardingModal {...baseProps} isDownloading downloadProgress={42} />);
        const bar = screen.getByRole('progressbar');
        expect(bar).toHaveAttribute('aria-valuenow', '42');
        expect(bar).toHaveAttribute('aria-valuemax', '100');
    });

    it('focuses the primary download action on open', () => {
        render(<OnboardingModal {...baseProps} />);
        expect(screen.getByRole('button', { name: /Download Core Binaries/i })).toHaveFocus();
    });
});
