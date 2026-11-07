<script lang="ts">
    import { Maximize, Home, ChevronLeft, List, Power, RotateCw, Clipboard, MonitorOff, Keyboard } from '@lucide/svelte';
    import { t } from '../i18n';

    // Derived: the labels must follow the active locale; a module-level array
    // would freeze the language used when the module was first imported.
    const shortcuts = $derived.by(() => [
        { label: t('shortcuts.full'), key: 'F', icon: Maximize },
        { label: t('shortcuts.home'), key: 'H', icon: Home },
        { label: t('shortcuts.back'), key: 'B', icon: ChevronLeft },
        { label: t('shortcuts.recents'), key: 'S', icon: List },
        { label: t('shortcuts.power'), key: 'P', icon: Power },
        { label: t('shortcuts.rotate'), key: 'R', icon: RotateCw },
        { label: t('shortcuts.paste'), key: 'V', icon: Clipboard },
        { label: t('shortcuts.off'), key: 'O', icon: MonitorOff }
    ]);
</script>

<div class="ds-card p-3.5 space-y-2">
    <div class="flex items-center gap-2 pb-1.5 mb-1" style="border-bottom: 1px solid var(--border-base)">
        <Keyboard size={12} />
        <h2 class="ds-label" style="color: var(--text-muted)">{t('shortcuts.title')}</h2>
    </div>
    <div class="grid grid-cols-4 gap-2">
        {#each shortcuts as shortcut (shortcut.key)}
            {@const Icon = shortcut.icon}
            <div title={shortcut.label} class="ds-inset flex flex-col items-center justify-center p-1.5 cursor-help">
                <span class="flex items-center justify-center mb-1" style="height: 16px">
                    <Icon size={13} />
                </span>
                <kbd class="ds-badge">{shortcut.key}</kbd>
            </div>
        {/each}
    </div>
</div>
