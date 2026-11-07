<script lang="ts">
    import { onMount } from 'svelte';
    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { isTauri } from '../lib/tauri';
    import { t } from '../i18n';

    let maximized = $state(false);

    onMount(() => {
        if (!isTauri()) return;
        const win = getCurrentWindow();
        let unlisten: (() => void) | undefined;
        win.isMaximized().then(v => (maximized = v)).catch(() => {});
        win.onResized(() => {
            win.isMaximized().then(v => (maximized = v)).catch(() => {});
        }).then(fn => {
            unlisten = fn;
        }).catch(() => {});
        return () => unlisten?.();
    });

    const BTN =
        'width: 46px; display: grid; place-items: center; align-self: stretch; border: 0; background: transparent; color: var(--text-muted); cursor: default; padding: 0; transition: background 0.12s, color 0.12s;';
</script>

<div
    class="flex items-stretch flex-shrink-0"
    style="margin: -8px -16px -8px 8px"
    aria-label="window controls"
>
    <button
        class="win-chrome-btn"
        style={BTN}
        aria-label={t('common.winMinimize')}
        title={t('common.winMinimize')}
        onclick={() => getCurrentWindow().minimize().catch(() => {})}
    >
        <svg width="15" height="15" stroke-width="2.2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M5 12h14" />
        </svg>
    </button>
    <button
        class="win-chrome-btn"
        style={BTN}
        aria-label={maximized ? t('common.winRestore') : t('common.winMaximize')}
        title={maximized ? t('common.winRestore') : t('common.winMaximize')}
        onclick={() => getCurrentWindow().toggleMaximize().catch(() => {})}
    >
        {#if maximized}
            <svg width="15" height="15" stroke-width="2.2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="8" y="8" width="11" height="11" rx="1.5" />
                <path d="M5 15V6.5C5 5.7 5.7 5 6.5 5H15" />
            </svg>
        {:else}
            <svg width="15" height="15" stroke-width="2.2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="5" y="5" width="14" height="14" rx="1.5" />
            </svg>
        {/if}
    </button>
    <button
        class="win-chrome-btn win-chrome-close"
        style={BTN}
        aria-label={t('common.winClose')}
        title={t('common.winClose')}
        onclick={() => getCurrentWindow().close().catch(() => {})}
    >
        <svg width="15" height="15" stroke-width="2.2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M18 6 6 18M6 6l12 12" />
        </svg>
    </button>
</div>
