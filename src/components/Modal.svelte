<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
        label?: string;
        labelledById?: string;
        describedById?: string;
        zIndex?: number;
        backdropStyle?: string;
        overlayClassName?: string;
        panelClassName?: string;
        panelStyle?: string;
        initialFocusRef?: HTMLElement | null;
        closeOnBackdrop?: boolean;
        closeOnEscape?: boolean;
        children: Snippet;
    }

    let {
        isOpen,
        onClose,
        label,
        labelledById,
        describedById,
        zIndex = 300,
        backdropStyle,
        overlayClassName = '',
        panelClassName = '',
        panelStyle,
        initialFocusRef,
        closeOnBackdrop = true,
        closeOnEscape = true,
        children
    }: Props = $props();

    let dialogRef = $state<HTMLDivElement>();
    const FOCUSABLE =
        'a[href], button:not([disabled]):not([tabindex="-1"]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    $effect(() => {
        if (!isOpen) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        const target =
            initialFocusRef ??
            dialogRef?.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ??
            dialogRef?.querySelector<HTMLElement>(FOCUSABLE) ??
            dialogRef;
        target?.focus();
        return () => {
            previouslyFocused?.focus?.();
        };
    });

    function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (closeOnEscape) onClose();
            return;
        }
        if (e.key !== 'Tab') return;
        const dialog = dialogRef;
        if (!dialog) return;
        const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
</script>

{#if isOpen}
    <div
        class="fixed inset-0 flex items-center justify-center {overlayClassName}"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledById}
        aria-describedby={describedById}
        tabindex={-1}
        onkeydown={handleKeyDown}
        bind:this={dialogRef}
        style="z-index: {zIndex}; outline: none"
    >
        <button
            type="button"
            tabindex="-1"
            aria-hidden="true"
            class="absolute inset-0 border-0 p-0"
            style={backdropStyle ?? 'background: rgba(0, 0, 0, 0.4)'}
            onclick={closeOnBackdrop ? onClose : undefined}
        ></button>

        <div class="ds-card relative shadow-xl ds-fade-in {panelClassName}" style={panelStyle}>
            {@render children()}
        </div>
    </div>
{/if}
