import { useEffect, useRef } from 'react';
import type { MdnsDevice } from './types';

/** Refreshes the mDNS list while the pairing modal waits for the phone to
 *  show its pairing screen. The callback lives in a ref so a new function
 *  identity on every render does not reset the interval, and a hidden window
 *  does not keep polling. */
export function usePairingRefresh(
    pairingTarget: MdnsDevice | null,
    onRefresh: () => void,
    intervalMs: number = 2000
) {
    const onRefreshRef = useRef(onRefresh);
    useEffect(() => {
        onRefreshRef.current = onRefresh;
    });

    const waiting = !!pairingTarget && !pairingTarget.service.includes('_adb-tls-pairing');
    useEffect(() => {
        if (!waiting) return;
        const interval = setInterval(() => {
            if (document.visibilityState === 'hidden') return;
            onRefreshRef.current();
        }, intervalMs);
        return () => clearInterval(interval);
    }, [waiting, intervalMs]);
}
