<script lang="ts">
    import type { Component } from 'svelte';
    import Tooltip from './Tooltip.svelte';

    interface Props {
        checked: boolean;
        onChange: (value: boolean) => void;
        icon: Component<{ size?: number }>;
        label: string;
        tooltip: string;
    }
    let { checked, onChange, icon: Icon, label, tooltip }: Props = $props();
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
    class="sb-row flex items-center justify-between gap-3 cursor-pointer py-1 px-2"
>
    <div class="flex items-center gap-2 min-w-0">
        <span
            class="ds-inset flex items-center justify-center shrink-0"
            style="padding: 4px; color: {checked ? 'var(--primary)' : 'var(--text-muted)'}"
        >
            <Icon size={12} />
        </span>
        <span class="ds-label">{label}</span>
        <span class="shrink-0"><Tooltip text={tooltip} /></span>
    </div>
    <span class="ds-toggle shrink-0" data-on={checked ? 'true' : 'false'} aria-hidden="true">
        <span></span>
    </span>
</div>
