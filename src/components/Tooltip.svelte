<script lang="ts">
    import type { Snippet } from 'svelte';

    interface Props {
        text: string;
        children?: Snippet;
        placement?: 'top' | 'bottom';
        block?: boolean;
    }

    let { text, children, placement = 'top', block = false }: Props = $props();
    let visible = $state(false);
    let tooltipId = $state(`tooltip-${Math.random().toString(36).slice(2)}`);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
    class={block ? 'relative block w-full' : 'relative inline-flex items-center'}
    role="group"
    onmouseenter={() => (visible = true)}
    onmouseleave={() => (visible = false)}
    onfocusin={() => (visible = true)}
    onfocusout={() => (visible = false)}
    onkeydown={(e) => {
        if (e.key === 'Escape') visible = false;
    }}
>
    {#if children}
        <span
            aria-describedby={visible ? tooltipId : undefined}
            style="color: inherit; display: {block ? 'block' : undefined}; width: {block ? '100%' : undefined}"
        >
            {@render children()}
        </span>
    {:else}
        <button
            type="button"
            aria-describedby={visible ? tooltipId : undefined}
            class="ds-caption"
            style="color: var(--text-muted); cursor: help; border: 0; background: transparent; padding: 0"
        >
            (?)
        </button>
    {/if}

    {#if visible}
        <div
            id={tooltipId}
            role="tooltip"
            class="ds-panel absolute left-1/2 -translate-x-1/2 w-48 p-2 shadow-lg z-[100] text-center ds-fade-in {placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}"
        >
            <p class="ds-caption" style="color: var(--text-base)">{text}</p>
            <div
                class="absolute left-1/2 -translate-x-1/2 border-4 border-transparent {placement === 'top' ? 'top-full -mt-1' : 'bottom-full -mb-1'}"
                style={placement === 'top'
                    ? 'border-top-color: var(--border-base)'
                    : 'border-bottom-color: var(--border-base)'}
            ></div>
        </div>
    {/if}
</div>
