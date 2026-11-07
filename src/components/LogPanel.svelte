<script lang="ts">
    import { Terminal, Trash2, Download } from '@lucide/svelte';
    import { invoke } from '@tauri-apps/api/core';
    import { t } from '../i18n';
    import type { LogEntry, LogLevel } from '../lib/logs';
    import { scrcpy } from '../lib/scrcpy.svelte';
    import { storageSnapshot } from '../lib/storage';
    import { showAlert } from '../lib/alerts.svelte';

    const LEVEL_COLORS: Record<LogLevel, string> = {
        system: '#8FA6FF',
        warn: '#E0C559',
        err: '#F88686',
        ok: '#57D06F'
    };

    function logColor(entry: LogEntry): string {
        if (entry.level) return LEVEL_COLORS[entry.level];
        const text = entry.text;
        if (/\[SYSTEM\]|\[INFO\]/i.test(text)) return LEVEL_COLORS.system;
        if (/\[ERR.+?\]|failed|falha|erro[ :]|error/i.test(text)) return LEVEL_COLORS.err;
        if (/\[WARN[ING]*\]|aviso/i.test(text)) return LEVEL_COLORS.warn;
        if (/\[OK\]|connected|descoberto|estabelecid|iniciad|concluíd|pronto|ready|success/i.test(text)) {
            return LEVEL_COLORS.ok;
        }
        return '#FAFAFA';
    }

    let containerRef: HTMLDivElement;
    let stick = true;
    let isLive = $state(false);
    let command = $state('');

    $effect(() => {
        const entries = scrcpy.logs;
        if (stick && containerRef) {
            containerRef.scrollTop = containerRef.scrollHeight;
        }
        if (entries.length > 0) {
            isLive = true;
            const timer = setTimeout(() => (isLive = false), 2000);
            return () => clearTimeout(timer);
        }
    });

    function handleScroll() {
        const el = containerRef;
        if (!el) return;
        stick = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Enter' && command.trim()) {
            void scrcpy.runTerminalCommand(command.trim());
            command = '';
        }
    }

    async function exportReport() {
        const data = {
            timestamp: new Date().toISOString(),
            localStorage: storageSnapshot([
                'scrcpy_config',
                'scrcpy_color_mode',
                'scrcpy_onboarding_done',
                'scrcpy_locale'
            ]),
            logs: scrcpy.logs
        };
        try {
            const fileName = `openscrcpy-logs-${Date.now()}.json`;
            await invoke('save_report', {
                content: JSON.stringify(data, null, 2),
                name: fileName
            });
            scrcpy.addLogs(t('logPanel.diagnosticReportSaved', { fileName }));
        } catch (e) {
            console.error('Export failed:', e);
            showAlert({
                title: t('logPanel.reportTitle'),
                message: t('logs.genericError', { error: String(e) }),
                kind: 'error'
            });
        }
    }
</script>

<div
    class="force-dark rounded-lg h-[220px] flex-none overflow-hidden font-mono flex flex-col relative"
    style="border: 1px solid #5C5C5C"
>
    <div class="px-4 py-2.5 flex justify-between items-center shrink-0" style="border-bottom: 1px solid #5C5C5C">
        <div class="flex items-center gap-3">
            <Terminal size={12} />
            <div class="flex items-center gap-2">
                <span class="ds-label" style="color: #AEAEAE">{t('logPanel.systemConsole')}</span>
                <span class="ds-dot" data-live={isLive}></span>
            </div>
        </div>
        <div class="flex gap-2 shrink-0">
            <button onclick={exportReport} class="ds-btn ds-btn-tertiary" title={t('logPanel.reportTitle')}>
                <Download size={10} />
                {t('logPanel.report')}
            </button>
            <button onclick={() => scrcpy.clearLogs()} class="ds-btn ds-btn-tertiary">
                <Trash2 size={10} />
                {t('logPanel.clear')}
            </button>
        </div>
    </div>

    <div bind:this={containerRef} onscroll={handleScroll} class="flex-1 overflow-y-auto p-4 pt-2">
        {#if scrcpy.logs.length === 0}
            <div class="h-full flex items-center justify-center">
                <span class="ds-caption" style="color: #AEAEAE">{t('logPanel.waitingForSequence')}</span>
            </div>
        {:else}
            <div class="space-y-1">
                {#each scrcpy.logs as entry (entry.id)}
                    <div
                        class="flex gap-3 leading-relaxed py-0.5 pl-3"
                        style="border-left: 1px solid #5C5C5C; font-size: 11px"
                    >
                        <span class="shrink-0 tabular-nums" style="color: #AEAEAE">{entry.time}</span>
                        <span class="break-all" style="color: {logColor(entry)}">{entry.text}</span>
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <div class="px-4 py-2 flex items-center gap-2 shrink-0" style="border-top: 1px solid #5C5C5C">
        <label for="log-terminal-input" class="select-none" style="color: var(--primary); font-size: 11px; font-weight: 700">$</label>
        <input
            id="log-terminal-input"
            type="text"
            aria-label={t('logPanel.terminalPlaceholder')}
            bind:value={command}
            onkeydown={handleKeyDown}
            placeholder={t('logPanel.terminalPlaceholder')}
            class="ds-input flex-1 font-mono"
            style="background: transparent; border-color: transparent; color: #FAFAFA; font-size: 11px"
        />
    </div>
</div>
