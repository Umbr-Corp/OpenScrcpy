import type { LucideIcon } from 'lucide-react';

export type AlertKind = 'warning' | 'error' | 'info' | 'success';

export interface AlertOptions {
    title: string;
    message: string;
    kind?: AlertKind;
    actionLabel?: string;
    onAction?: () => void;
    showCancel?: boolean;
    cancelLabel?: string;
    onCancel?: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
    /** Download screen: ThemedModal renders a bar and hides its buttons. */
    progress?: number;
    progressDetail?: string;
    /** Replaces the kind chip with a short, informational label. */
    eyebrow?: string;
    /** Replaces the kind icon. */
    icon?: LucideIcon;
}

export interface AlertSnapshot extends AlertOptions {
    isOpen: boolean;
}

const CLOSED: AlertSnapshot = { isOpen: false, title: '', message: '' };

let snapshot: AlertSnapshot = CLOSED;
const listeners = new Set<() => void>();

function publish(next: AlertSnapshot) {
    snapshot = next;
    // Copy first: a listener may unsubscribe while we iterate.
    for (const listener of Array.from(listeners)) {
        listener();
    }
}

/** Opens the app-wide alert dialog, replacing the current one. */
export function showAlert(options: AlertOptions) {
    publish({ ...options, isOpen: true });
}

export function closeAlert() {
    if (!snapshot.isOpen) return;
    // Drop the closures held by the alert so a closed dialog does not keep
    // the component that opened it alive.
    publish(CLOSED);
}

export function subscribeAlert(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Stable snapshot while nothing changes, as useSyncExternalStore requires. */
export function getAlertSnapshot() {
    return snapshot;
}
