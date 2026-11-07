<script lang="ts">
    import type { Component, Snippet } from 'svelte';
    import { X } from '@lucide/svelte';
    import Modal from './Modal.svelte';
    import { t } from '../i18n';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
        title: string;
        icon?: Component<{ size?: number }>;
        zIndex?: number;
        backdropStyle?: string;
        overlayClassName?: string;
        panelClassName?: string;
        initialFocusRef?: HTMLElement | null;
        closeOnBackdrop?: boolean;
        footer?: Snippet;
        children: Snippet;
    }

    let {
        isOpen,
        onClose,
        title,
        icon: Icon,
        zIndex,
        backdropStyle,
        overlayClassName = 'p-6',
        panelClassName = 'w-full max-w-md p-6',
        initialFocusRef,
        closeOnBackdrop,
        footer,
        children
    }: Props = $props();
</script>

<Modal
    {isOpen}
    {onClose}
    label={title}
    {zIndex}
    {backdropStyle}
    {overlayClassName}
    {panelClassName}
    {initialFocusRef}
    {closeOnBackdrop}
>
    <div class="flex justify-between items-center gap-3 mb-4">
        <h3 class="ds-label ds-strong flex items-center gap-2" style="color: var(--text-base)">
            {#if Icon}<Icon size={16} />{/if} {title}
        </h3>
        <button onclick={onClose} class="ds-btn ds-btn-tertiary" aria-label={t('common.close')}>
            <X size={16} />
        </button>
    </div>

    {@render children()}

    {#if footer}
        <div class="mt-6">{@render footer()}</div>
    {/if}
</Modal>
