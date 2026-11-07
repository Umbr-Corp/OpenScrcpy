<script lang="ts">
    import Tooltip from './Tooltip.svelte';

    interface Props {
        label: string;
        value: number;
        min: number;
        max: number;
        step?: number;
        format?: (v: number) => string;
        tooltip?: string;
        onChange: (v: number) => void;
    }

    let {
        label,
        value,
        min,
        max,
        step = 1,
        format = (v: number) => String(v),
        tooltip,
        onChange
    }: Props = $props();

    // The parent prop is the source of truth; the effect below re-syncs it.
    // svelte-ignore state_referenced_locally
    let localValue = $state(value);

    $effect(() => {
        localValue = value;
    });

    function commit() {
        onChange(localValue);
    }
</script>

<div class="space-y-1">
    <div class="flex justify-between items-center">
        <div class="flex items-center gap-1.5">
            <span class="ds-label">{label}</span>
            {#if tooltip}
                <Tooltip text={tooltip} />
            {/if}
        </div>
        <span class="ds-caption tabular-nums" style="color: var(--primary)">{format(localValue)}</span>
    </div>
    <input
        type="range"
        {min}
        {max}
        {step}
        value={localValue}
        aria-label={label}
        oninput={(e) => (localValue = parseFloat((e.currentTarget as HTMLInputElement).value))}
        onmouseup={commit}
        ontouchend={commit}
        onkeyup={commit}
        class="ds-range w-full"
    />
</div>
