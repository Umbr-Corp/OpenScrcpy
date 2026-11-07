<script lang="ts">
    import { open } from '@tauri-apps/plugin-dialog';
    import { Coffee, MonitorOff, Volume2, Layers, Maximize, Square, Circle, Folder, Settings2, ActivitySquare, Move } from '@lucide/svelte';
    import Tooltip from './Tooltip.svelte';
    import Select from './Select.svelte';
    import SessionToggle from './SessionToggle.svelte';
    import { t } from '../i18n';
    import { scrcpy } from '../lib/scrcpy.svelte';
    import type { ScrcpyConfig } from '../lib/types';

    const AUDIO_CODEC_VALUES = ['auto', 'opus', 'aac', 'flac', 'raw'] as const;
    type AudioCodec = (typeof AUDIO_CODEC_VALUES)[number];

    const AUDIO_CODEC_LABEL_KEY: Record<AudioCodec, string> = {
        auto: 'sessionBehavior.audioCodecAuto',
        opus: 'sessionBehavior.audioCodecOpus',
        aac: 'sessionBehavior.audioCodecAac',
        flac: 'sessionBehavior.audioCodecFlac',
        raw: 'sessionBehavior.audioCodecRaw'
    };

    const config = $derived(scrcpy.config);
    const audioCodec = $derived(
        AUDIO_CODEC_VALUES.includes(config.audioCodec as AudioCodec)
            ? (config.audioCodec as AudioCodec)
            : 'auto'
    );

    function update<K extends keyof ScrcpyConfig>(field: K, value: ScrcpyConfig[K]) {
        scrcpy.updateConfig({ [field]: value });
    }

    async function pickFolder() {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: t('sessionBehavior.selectRecordingFolderTitle')
            });
            if (selected && typeof selected === 'string') update('recordPath', selected);
        } catch (e) {
            console.error(e);
        }
    }

</script>

<div class="space-y-4">
    <div class="ds-card p-3 space-y-2">
        <div class="flex items-center gap-2" style="border-bottom: 1px solid var(--border-base); padding-bottom: 8px">
            <Settings2 size={12} style="color: var(--text-muted)" />
            <h2 class="ds-label ds-strong">{t('sessionBehavior.title')}</h2>
        </div>

        <div class="flex flex-col gap-1">
            <SessionToggle
                checked={config.stayAwake || false}
                onChange={(v) => update('stayAwake', v)}
                icon={Coffee}
                label={t('sessionBehavior.stayAwake')}
                tooltip={t('sessionBehavior.stayAwakeTooltip')}
            />
            <SessionToggle
                checked={config.keepActive || false}
                onChange={(v) => update('keepActive', v)}
                icon={ActivitySquare}
                label={t('sessionBehavior.keepActive')}
                tooltip={t('sessionBehavior.keepActiveTooltip')}
            />
            <SessionToggle
                checked={config.turnOff || false}
                onChange={(v) => update('turnOff', v)}
                icon={MonitorOff}
                label={t('sessionBehavior.screenOff')}
                tooltip={t('sessionBehavior.screenOffTooltip')}
            />
            <div>
                <SessionToggle
                    checked={config.audioEnabled || false}
                    onChange={(v) => update('audioEnabled', v)}
                    icon={Volume2}
                    label={t('sessionBehavior.forwardAudio')}
                    tooltip={t('sessionBehavior.forwardAudioTooltip')}
                />
                {#if config.audioEnabled}
                    <div
                        class="pr-2 pb-1"
                        style="margin-top: 2px; padding-left: 28px; opacity: {config.audioEnabled ? 1 : 0.45}"
                    >
                        <div class="flex items-center gap-1.5">
                            <span class="ds-caption" style="color: var(--text-muted)">
                                {t('sessionBehavior.audioCodec')}
                            </span>
                            <Tooltip text={t('sessionBehavior.audioCodecTooltip')} />
                            <div class="relative ml-auto">
                                <Select
                                    value={audioCodec}
                                    onChange={(v) => update('audioCodec', v)}
                                    options={AUDIO_CODEC_VALUES.map((opt) => ({
                                        value: opt,
                                        label: t(AUDIO_CODEC_LABEL_KEY[opt])
                                    }))}
                                    ariaLabel={t('sessionBehavior.audioCodec')}
                                    disabled={!config.audioEnabled}
                                    triggerClassName="sb-select"
                                    optionClassName="sb-opt"
                                />
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
            <SessionToggle
                checked={config.alwaysOnTop || false}
                onChange={(v) => update('alwaysOnTop', v)}
                icon={Layers}
                label={t('sessionBehavior.alwaysOnTop')}
                tooltip={t('sessionBehavior.alwaysOnTopTooltip')}
            />
            <SessionToggle
                checked={config.fullscreen || false}
                onChange={(v) => update('fullscreen', v)}
                icon={Maximize}
                label={t('sessionBehavior.fullScreen')}
                tooltip={t('sessionBehavior.fullScreenTooltip')}
            />
            <SessionToggle
                checked={config.borderless || false}
                onChange={(v) => update('borderless', v)}
                icon={Square}
                label={t('sessionBehavior.borderless')}
                tooltip={t('sessionBehavior.borderlessTooltip')}
            />
            <SessionToggle
                checked={config.rememberWindowPosition !== false}
                onChange={(v) => update('rememberWindowPosition', v)}
                icon={Move}
                label={t('sessionBehavior.rememberWindowPosition')}
                tooltip={t('sessionBehavior.rememberWindowPositionTooltip')}
            />
            {#if config.sessionMode !== 'mic'}
                <SessionToggle
                    checked={config.record || false}
                    onChange={(v) => update('record', v)}
                    icon={Circle}
                    label={t('sessionBehavior.recordFeed')}
                    tooltip={t('sessionBehavior.recordFeedTooltip')}
                />
            {/if}
        </div>

        {#if config.sessionMode !== 'mic'}
            <div class="pt-2 space-y-2" style="border-top: 1px solid var(--border-base)">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                        <Folder size={12} style="color: var(--text-muted)" />
                        <span class="ds-label">{t('sessionBehavior.recordPath')}</span>
                    </div>
                    <button
                        type="button"
                        onclick={pickFolder}
                        class="ds-btn-tertiary"
                        style="padding: 3px 8px; font-size: 12px; line-height: 15px"
                    >
                        {t('sessionBehavior.change')}
                    </button>
                </div>
                <div class="ds-inset px-2.5 py-1.5">
                    <p class="ds-caption font-mono truncate" style="color: var(--text-muted)">
                        {config.recordPath || t('sessionBehavior.defaultVideosFolder')}
                    </p>
                </div>
            </div>
        {/if}
    </div>
</div>
