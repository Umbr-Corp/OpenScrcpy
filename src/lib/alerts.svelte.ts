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

const CLOSED: AlertSnapshot = { isOpen: false, title: '', message: '' };

export const alert = $state<AlertSnapshot>({ ...CLOSED });

export function showAlert(options: AlertOptions) {
    Object.assign(alert, CLOSED, options, { isOpen: true });
}

export function closeAlert() {
    Object.assign(alert, CLOSED);
}
