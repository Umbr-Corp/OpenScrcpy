<script lang="ts">
    import type { Component } from 'svelte';

    interface Props {
        checked: boolean;
        onChange: (value: boolean) => void;
        label: string;
        hint?: string;
        icon?: Component<{ size?: number }>;
    }

    let { checked, onChange, label, hint, icon: Icon }: Props = $props();
</script>

<div
    role="switch"
    aria-checked={checked}
    tabindex={0}
    onclick={() => onChange(!checked)}
    onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onChange(!checked);
        }
    }}
    class="cp-row flex items-center justify-between gap-3 cursor-pointer px-3 py-2"
>
    <div class="flex items-center gap-2 min-w-0">
        {#if Icon}
            <span
                style="color: {checked ? 'var(--primary)' : 'var(--text-muted)'}"
                class="flex items-center shrink-0"
            >
                <Icon size={12} />
            </span>
        {/if}
        <div class="min-w-0">
            <span class="ds-label truncate block">{label}</span>
            {#if hint}
                <span
                    class="block ds-caption truncate"
                    style="color: var(--text-muted); font-size: 10.5px; line-height: 13px"
                >
                    {hint}
                </span>
            {/if}
        </div>
    </div>
    <div class="flex items-center gap-2 shrink-0">
        <span class="ds-toggle" data-on={checked ? 'true' : 'false'} aria-hidden="true">
            <span></span>
        </span>
    </div>
</div>
