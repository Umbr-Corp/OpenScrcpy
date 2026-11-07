<script lang="ts">
    import { onMount } from 'svelte';
    import { listen } from '@tauri-apps/api/event';
    import { t } from '../../i18n';
    import { isTauri } from '../../lib/tauri';

    interface Props {
        sessionRunning: boolean;
    }

    let { sessionRunning }: Props = $props();
    let level = $state<number | null>(null);
    let route = $state<{ sink: string; ok: boolean } | null>(null);

    $effect(() => {
        if (sessionRunning) return;
        level = null;
        route = null;
    });

    onMount(() => {
        if (!isTauri()) return;
        let disposed = false;
        const unlisteners: (() => void)[] = [];

        listen<number>('mic-level', event => {
            const db = event.payload;
            level = typeof db === 'number' && Number.isFinite(db) ? Math.round(db) : null;
        }).then(unlisten => {
            if (disposed) unlisten();
            else unlisteners.push(unlisten);
        });

        listen<[string, boolean]>('mic-route', event => {
            const [sink, ok] = event.payload;
            route = { sink, ok };
        }).then(unlisten => {
            if (disposed) unlisten();
            else unlisteners.push(unlisten);
        });

        return () => {
            disposed = true;
            unlisteners.forEach(unlisten => unlisten());
        };
    });

    const levelWidth = $derived(
        typeof level === 'number' ? Math.max(0, Math.min(100, ((level + 60) / 60) * 100)) : 0
    );
</script>

<div class="flex items-center justify-between">
    <span class="ds-label">{t('controlPanel.micDestLabel')}</span>
    {#if !sessionRunning}
        <span class="ds-caption" style="color: var(--text-muted)">{t('controlPanel.micDestIdle')}</span>
    {:else if !route?.sink}
        <span class="ds-caption" style="color: var(--text-muted)">{t('controlPanel.micDestSearching')}</span>
    {:else}
        <span
            class="ds-caption ds-strong"
            style="color: {route.ok ? 'var(--success, var(--primary))' : 'var(--warning, var(--secondary))'}"
            title={route.sink}
        >
            {route.sink}{route.ok ? '' : ' *'}
        </span>
    {/if}
</div>

{#if sessionRunning}
    <div class="space-y-1">
        <div class="flex items-center justify-between">
            <span class="ds-label">{t('controlPanel.micLevelLabel')}</span>
            <span class="ds-caption font-mono" style="color: var(--text-muted)">
                {typeof level === 'number' ? `${level} dB` : '—'}
            </span>
        </div>
        <div style="height: 8px; border-radius: 99px; background: var(--surface-inset, rgba(0,0,0,0.25)); overflow: hidden">
            <div
                style="height: 100%; width: {levelWidth}%; background: var(--primary); transition: width 120ms linear"
            ></div>
        </div>
    </div>
{/if}
