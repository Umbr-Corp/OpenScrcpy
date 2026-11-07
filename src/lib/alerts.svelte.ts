import type { Component } from 'svelte';

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
    progress?: number;
    progressDetail?: string;
    eyebrow?: string;
    icon?: Component<{ size?: number }>;
}

export interface AlertSnapshot extends AlertOptions {
    isOpen: boolean;
}

const EMPTY: AlertSnapshot = {
    isOpen: false,
    title: '',
    message: '',
    kind: undefined,
    actionLabel: undefined,
    onAction: undefined,
    showCancel: undefined,
    cancelLabel: undefined,
    onCancel: undefined,
    secondaryLabel: undefined,
    onSecondary: undefined,
    progress: undefined,
    progressDetail: undefined,
    eyebrow: undefined,
    icon: undefined
};

export const alert = $state<AlertSnapshot>({ ...EMPTY });

export function showAlert(options: AlertOptions) {
    // Start from EMPTY on every call: optional fields from the previous alert
    // must not leak into the next one (progress, callbacks, labels, icon...).
    Object.assign(alert, EMPTY, options, { isOpen: true });
}

export function closeAlert() {
    Object.assign(alert, EMPTY);
}
