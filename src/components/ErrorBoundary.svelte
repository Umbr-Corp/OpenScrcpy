<script lang="ts">
    import type { Snippet } from 'svelte';
    import { AlertCircle, Download, RefreshCcw } from '@lucide/svelte';
    import { invoke } from '@tauri-apps/api/core';
    import { t } from '../i18n';
    import { storageSnapshot } from '../lib/storage';

    interface Props {
        children: Snippet;
    }
    let { children }: Props = $props();

    async function exportDiagnostics(error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        const diagnostics = {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            localStorage: storageSnapshot([
                'scrcpy_config',
                'scrcpy_color_mode',
                'scrcpy_onboarding_done',
                'scrcpy_locale'
            ]),
            error: err.message || 'Unknown error',
            stack: err.stack || 'No stack trace available'
        };
        try {
            const fileName = `openscrcpy-diagnostics-${Date.now()}.json`;
            await invoke('save_report', {
                content: JSON.stringify(diagnostics, null, 2),
                name: fileName
            });
            alert(t('errorBoundary.diagnosticSavedAlert', { fileName }));
        } catch (e) {
            console.error('Export failed:', e);
        }
    }
</script>

<svelte:boundary onerror={(error) => console.error('Uncaught error:', error)}>
    {@render children()}

    {#snippet failed(error, _reset)}
        <div
            class="min-h-screen flex items-center justify-center p-6 font-sans"
            style="background: var(--bg-base); color: var(--text-base)"
        >
            <div
                class="ds-card max-w-md w-full p-8 space-y-6 text-center shadow-xl"
                style="border-style: dashed"
            >
                <div class="ds-inset inline-flex p-4 rounded-md mb-2" style="border-style: dashed">
                    <AlertCircle size={40} />
                </div>

                <div class="space-y-2">
                    <span class="ds-badge" style="border-style: dashed">
                        {t('errorBoundary.errorSignature')}
                    </span>
                    <h1 class="ds-body ds-strong">{t('errorBoundary.title')}</h1>
                    <p class="ds-caption" style="color: var(--text-muted)">
                        {t('errorBoundary.subtitle')}
                    </p>
                </div>

                <div class="ds-inset rounded-md p-4 text-left overflow-hidden">
                    <p class="ds-caption font-mono break-all" style="color: var(--text-base)">
                        {error instanceof Error ? error.message : String(error)}
                    </p>
                </div>

                <div class="grid grid-cols-2 gap-3">
                    <button onclick={() => window.location.reload()} class="ds-btn ds-btn-secondary">
                        <RefreshCcw size={14} />
                        {t('errorBoundary.reboot')}
                    </button>
                    <button onclick={() => exportDiagnostics(error)} class="ds-btn ds-btn-primary">
                        <Download size={14} />
                        {t('errorBoundary.exportLogs')}
                    </button>
                </div>

                <p class="ds-caption" style="color: var(--text-muted)">
                    {t('errorBoundary.recoveryEngine')}
                </p>
            </div>
        </div>
    {/snippet}
</svelte:boundary>
