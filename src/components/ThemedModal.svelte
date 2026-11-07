<script lang="ts">
    import type { Component } from 'svelte';
    import { X, AlertTriangle, AlertCircle, Info, CheckCircle2 } from '@lucide/svelte';
    import Modal from './Modal.svelte';
    import ProgressBar from './ProgressBar.svelte';
    import { t } from '../i18n';

    type ModalKind = 'warning' | 'error' | 'info' | 'success';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
        title: string;
        message: string;
        kind?: ModalKind;
        actionLabel?: string;
        onAction?: () => void;
        secondaryLabel?: string;
        onSecondary?: () => void;
        showCancel?: boolean;
        cancelLabel?: string;
        onCancel?: () => void;
        progress?: number;
        progressDetail?: string;
        eyebrow?: string;
        icon?: Component<{ size?: number }>;
    }

    let {
        isOpen,
        onClose,
        title,
        message,
        kind = 'info',
        actionLabel,
        onAction,
        secondaryLabel,
        onSecondary,
        showCancel = false,
        cancelLabel,
        onCancel,
        progress,
        progressDetail,
        eyebrow,
        icon
    }: Props = $props();

    const KIND_ICON = {
        warning: AlertTriangle,
        error: AlertCircle,
        info: Info,
        success: CheckCircle2
    } as const;
    const DASHED_KINDS = new Set<ModalKind>(['warning', 'error']);

    const messageId = $props.id();
    const resolvedActionLabel = $derived(actionLabel ?? t('common.ok'));
    const resolvedCancelLabel = $derived(cancelLabel ?? t('common.cancel'));
    const Icon = $derived(icon ?? KIND_ICON[kind]);
    const dashed = $derived(DASHED_KINDS.has(kind));
    const borderStyle = $derived(dashed ? 'border-style: dashed' : undefined);
    const isProgress = $derived(typeof progress === 'number');
</script>

<Modal
    {isOpen}
    {onClose}
    label={title}
    describedById={messageId}
    overlayClassName="p-6"
    panelClassName="w-full max-w-md overflow-hidden flex flex-col"
    panelStyle={borderStyle}
    closeOnBackdrop={!isProgress}
    closeOnEscape={!isProgress}
>
    {#if !isProgress}
        <div class="absolute top-4 right-4 z-10">
            <button onclick={onClose} aria-label={t('common.close')} class="ds-btn ds-btn-tertiary">
                <X size={20} />
            </button>
        </div>
    {/if}

    <div class="p-8 pb-6 flex flex-col items-center text-center pt-12">
        <div class="ds-inset w-16 h-16 rounded-md flex items-center justify-center mb-6" style={borderStyle}>
            {#if Icon}
                <Icon size={32} />
            {/if}
        </div>

        <span class="ds-badge mb-3" style={eyebrow ? 'border-color: var(--primary); color: var(--primary)' : borderStyle}>
            {eyebrow ?? t(`common.kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`)}
        </span>

        <h3 class="ds-body ds-strong mb-3">{title}</h3>
        <p
            id={messageId}
            class="ds-caption w-full overflow-y-auto whitespace-pre-line {eyebrow
                ? 'ds-inset rounded-md p-3 text-left max-h-[132px]'
                : 'max-h-[180px]'}"
            style="color: var(--text-muted)"
        >
            {message}
        </p>

        {#if isProgress}
            <ProgressBar
                value={progress ?? 0}
                label={title}
                detail={progressDetail}
                class="mt-5 w-full max-w-[280px]"
            />
        {/if}
    </div>

    {#if !isProgress}
        <div class="p-4 pt-0 flex flex-col gap-2">
            {#if secondaryLabel}
                <button
                    onclick={() => {
                        onSecondary?.();
                        onClose();
                    }}
                    class="ds-btn ds-btn-tertiary w-full"
                >
                    {secondaryLabel}
                </button>
            {/if}
            <div class="flex gap-3">
                {#if showCancel}
                    <button
                        onclick={() => {
                            onCancel?.();
                            onClose();
                        }}
                        class="ds-btn ds-btn-secondary flex-1"
                    >
                        {resolvedCancelLabel}
                    </button>
                {/if}
                <button
                    data-autofocus
                    onclick={() => {
                        onAction?.();
                        onClose();
                    }}
                    class={showCancel ? 'ds-btn ds-btn-primary flex-1' : 'ds-btn ds-btn-primary w-full'}
                >
                    {resolvedActionLabel}
                </button>
            </div>
        </div>
    {/if}
</Modal>
