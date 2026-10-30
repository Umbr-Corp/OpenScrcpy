import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePairingRefresh } from '../usePairingRefresh';

const waiting = {
    name: 'adb-123-abc',
    service: '_adb-tls-connect._tcp',
    address: '192.168.0.5:5555',
};

function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
    });
}

describe('usePairingRefresh', () => {
    afterEach(() => {
        vi.useRealTimers();
        setVisibility('visible');
    });

    it('does not poll while the window is hidden', () => {
        vi.useFakeTimers();
        setVisibility('hidden');
        const onRefresh = vi.fn();

        renderHook(() => usePairingRefresh(waiting, onRefresh, 2000));
        vi.advanceTimersByTime(10_000);

        expect(onRefresh).not.toHaveBeenCalled();
    });

    it('polls while visible and stops once the pairing service appears', () => {
        vi.useFakeTimers();
        setVisibility('visible');
        const onRefresh = vi.fn();

        const { rerender } = renderHook(
            ({ target }) => usePairingRefresh(target, onRefresh, 2000),
            { initialProps: { target: waiting } }
        );

        vi.advanceTimersByTime(4000);
        expect(onRefresh).toHaveBeenCalledTimes(2);

        rerender({ target: { ...waiting, service: '_adb-tls-pairing._tcp' } });
        vi.advanceTimersByTime(4000);
        expect(onRefresh).toHaveBeenCalledTimes(2);
    });
});
