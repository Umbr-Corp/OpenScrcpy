<script lang="ts" generics="V extends string | number">
    import { ChevronDown } from '@lucide/svelte';

    interface Option {
        value: V;
        label: string;
    }

    interface Props {
        value: V | undefined;
        onChange: (val: V) => void;
        options: Option[];
        label?: string;
        triggerClassName?: string;
        optionClassName?: string;
        customLabel?: string;
        ariaLabel?: string;
        disabled?: boolean;
        class?: string;
    }

    let {
        value,
        onChange,
        options,
        label,
        triggerClassName = '',
        optionClassName = '',
        customLabel,
        ariaLabel,
        disabled = false,
        class: className = ''
    }: Props = $props();

    let isOpen = $state(false);
    let highlighted = $state(0);
    let containerRef: HTMLDivElement;
    let triggerRef: HTMLButtonElement;
    const listboxId = $props.id();

    const selectedIndex = $derived(options.findIndex(opt => opt.value === value));
    const selectedOption = $derived(selectedIndex >= 0 ? options[selectedIndex] : undefined);
    const triggerLabel = $derived(
        selectedOption?.label ?? customLabel ?? String(value ?? '')
    );
    const optionId = (index: number) => `${listboxId}-opt-${index}`;

    function open() {
        if (disabled) return;
        highlighted = selectedIndex >= 0 ? selectedIndex : 0;
        isOpen = true;
    }

    function select(index: number) {
        const opt = options[index];
        if (!opt) return;
        onChange(opt.value);
        isOpen = false;
        triggerRef?.focus();
    }

    function moveHighlight(delta: 1 | -1) {
        if (options.length === 0) return;
        highlighted = (highlighted + delta + options.length) % options.length;
    }

    function handleTriggerKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            if (isOpen) {
                e.preventDefault();
                e.stopPropagation();
                isOpen = false;
            }
            return;
        }
        if (e.key === 'Tab') {
            if (isOpen) isOpen = false;
            return;
        }
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
            return;
        }
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                moveHighlight(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                moveHighlight(-1);
                break;
            case 'Home':
                e.preventDefault();
                highlighted = 0;
                break;
            case 'End':
                e.preventDefault();
                highlighted = Math.max(0, options.length - 1);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                select(highlighted);
                break;
        }
    }

    $effect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef && !containerRef.contains(event.target as Node)) {
                isOpen = false;
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    });

    $effect(() => {
        if (!isOpen || highlighted < 0) return;
        const el = document.getElementById(optionId(highlighted));
        if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'nearest' });
        }
    });
</script>

<div class="relative {className}" bind:this={containerRef}>
    {#if label}
        <span class="ds-label block" style="margin-bottom: 4px">{label}</span>
    {/if}
    <button
        type="button"
        role="combobox"
        bind:this={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={isOpen ? optionId(highlighted) : undefined}
        aria-label={ariaLabel ?? label ?? triggerLabel}
        {disabled}
        onclick={() => (isOpen ? (isOpen = false) : open())}
        onkeydown={handleTriggerKeyDown}
        class="ds-select-btn {triggerClassName} w-full flex items-center justify-between gap-2"
    >
        <span class="truncate">{triggerLabel}</span>
        <ChevronDown
            size={14}
            style="color: var(--text-muted); transform: {isOpen ? 'rotate(180deg)' : 'none'}; transition: transform 0.09s ease-out"
        />
    </button>

    {#if isOpen}
        <div
            role="listbox"
            id={listboxId}
            aria-label={ariaLabel ?? label}
            class="ds-panel ds-fade-in absolute left-0 right-0 z-[100] py-1"
            style="margin-top: 4px; padding: 4px"
        >
            {#each options as opt, index (opt.value)}
                <div
                    id={optionId(index)}
                    role="option"
                    tabindex="-1"
                    aria-selected={opt.value === value}
                    onmouseenter={() => (highlighted = index)}
                    onclick={() => select(index)}
                    onkeydown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            select(index);
                        }
                    }}
                    class="ds-btn-tertiary {optionClassName} w-full cursor-pointer"
                    style="justify-content: flex-start; {index === highlighted && opt.value !== value
                        ? 'background: var(--bg-input);'
                        : ''} {opt.value === value ? 'color: var(--primary);' : ''}"
                >
                    {opt.label}
                </div>
            {/each}
        </div>
    {/if}
</div>
