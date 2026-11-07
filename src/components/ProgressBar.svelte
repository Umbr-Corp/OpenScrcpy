<script lang="ts">
    interface Props {
        value: number;
        label: string;
        variant?: 'dialog' | 'card' | 'compact';
        detail?: string;
        class?: string;
    }

    let { value, label, variant = 'dialog', detail, class: className = '' }: Props = $props();

    const TRACK = {
        dialog: 'ds-inset h-2.5 rounded-sm',
        card: 'ds-inset h-2 rounded-full',
        compact: 'h-1 rounded-full'
    } as const;
    const FILL = {
        dialog: 'rounded-sm',
        card: 'rounded-full',
        compact: 'rounded-full'
    } as const;

    const safe = $derived(Math.min(100, Math.max(0, Math.round(value))));
</script>

<div class={className}>
    <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safe}
        class="w-full overflow-hidden {TRACK[variant]}"
        style={variant === 'compact' ? 'background-color: var(--bg-input)' : undefined}
    >
        <div
            class="h-full {FILL[variant]}"
            style="width: {safe}%; background: var(--primary); transition: width 150ms linear"
        ></div>
    </div>
    {#if detail}
        <div class="ds-caption mt-2" style="color: var(--text-muted)">{detail}</div>
    {/if}
</div>
