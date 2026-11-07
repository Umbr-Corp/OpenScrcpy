<script lang="ts">
    import { Play, Square, Monitor, Camera, LayoutGrid, Mic, Lock, Unlock, Settings2, Video, ExternalLink, Keyboard, Mouse } from '@lucide/svelte';
    import type { RenderDriverSupport, ScrcpyConfig } from '../lib/types';
    import Tooltip from './Tooltip.svelte';
    import Select from './Select.svelte';
    import SliderRow from './SliderRow.svelte';
    import ToggleRow from './ControlPanel/ToggleRow.svelte';
    import PerformanceGrid from './ControlPanel/PerformanceGrid.svelte';
    import MicMeter from './ControlPanel/MicMeter.svelte';
    import { buildRendererOptions } from './ControlPanel/rendererOptions';
    import { t } from '../i18n';

    interface Props {
        config: ScrcpyConfig;
        setConfig: (config: ScrcpyConfig) => void;
        onStart: () => void;
        onStop: () => void;
        isRunning: boolean;
        isStarting?: boolean;
        onListOptions: (arg: string) => void;
        detectedCameras?: { id: string; name: string }[];
        renderDriverSupport?: RenderDriverSupport;
    }

    let {
        config,
        setConfig,
        onStart,
        onStop,
        isRunning,
        isStarting = false,
        onListOptions,
        detectedCameras = [],
        renderDriverSupport = {
            hostOs: 'unknown',
            supportsRenderDriver: false,
            supportedDrivers: []
        }
    }: Props = $props();

    function handleChange<K extends keyof ScrcpyConfig>(field: K, value: ScrcpyConfig[K]) {
        setConfig({ ...config, [field]: value });
    }

    const rendererOptions = $derived(buildRendererOptions(renderDriverSupport, t('controlPanel.rendererAuto')));
    const vdPreset = $derived.by(() => {
        const w = config.vdWidth;
        const h = config.vdHeight;
        if (w === 1920 && h === 1080) return '1080p';
        if (w === 2560 && h === 1440) return '1440p';
        if (w === 3840 && h === 2160) return '4k';
        if (w === 2560 && h === 1080) return 'ultrawide';
        return 'custom';
    });

</script>

<main class="lg:col-span-6 space-y-4">
    <section class="ds-card p-3">
        <span class="ds-label block" style="color: var(--text-secondary); margin-bottom: 8px">{t('controlPanel.captureSource')}</span>
        <div class="ds-tabs" role="tablist" aria-label={t('controlPanel.captureSource')}>
            <button
                type="button"
                role="tab"
                aria-selected={config.sessionMode === 'mirror'}
                data-active={config.sessionMode === 'mirror'}
                onclick={() => handleChange('sessionMode', 'mirror')}
                class="ds-tab"
            >
                <Monitor size={16} />
                <span>{t('controlPanel.screen')}</span>
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={config.sessionMode === 'camera'}
                data-active={config.sessionMode === 'camera'}
                onclick={() => handleChange('sessionMode', 'camera')}
                class="ds-tab"
            >
                <Camera size={16} />
                <span>{t('controlPanel.camera')}</span>
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={config.sessionMode === 'desktop'}
                data-active={config.sessionMode === 'desktop'}
                onclick={() => handleChange('sessionMode', 'desktop')}
                class="ds-tab"
            >
                <LayoutGrid size={16} />
                <span>{t('controlPanel.desktop')}</span>
            </button>
            <button
                type="button"
                role="tab"
                aria-selected={config.sessionMode === 'mic'}
                data-active={config.sessionMode === 'mic'}
                onclick={() => handleChange('sessionMode', 'mic')}
                class="ds-tab"
            >
                <Mic size={16} />
                <span>{t('controlPanel.microphone')}</span>
            </button>
        </div>
    </section>

    <section class="ds-card p-3 space-y-3">
        <div class="flex justify-between items-center" style="border-bottom: 1px solid var(--border-base); padding-bottom: 8px">
            <h2 class="ds-label ds-strong">{t('controlPanel.engineConfiguration')}</h2>
            <div class="flex gap-1.5">
                {#if config.sessionMode === 'mirror' && (config.hidKeyboard || config.hidMouse) && config.otgPure}
                    <span class="ds-badge">{t('controlPanel.otgOnly')}</span>
                {/if}
                <span class="ds-badge" data-live={isRunning}>{isRunning ? t('controlPanel.active') : t('controlPanel.ready')}</span>
            </div>
        </div>

        <div class="space-y-2.5">
            {#if config.sessionMode === 'mirror'}
                <div class="ds-panel p-3 space-y-3">
                    <div class="flex items-center gap-2">
                        <Keyboard size={12} />
                        <span class="ds-label ds-strong">{t('controlPanel.inputEnhancements')}</span>
                    </div>
                    <p class="ds-caption" style="color: var(--text-secondary)">{t('controlPanel.inputEnhancementsDescription')}</p>
                    <div class="grid grid-cols-2 gap-3">
                        <Tooltip text={t('controlPanel.hidKeyboardTooltip')} block>
                            <ToggleRow
                                checked={!!config.hidKeyboard}
                                onChange={(v) => handleChange('hidKeyboard', v)}
                                icon={Keyboard}
                                label={t('controlPanel.hidKeyboard')}
                            />
                        </Tooltip>
                        <Tooltip text={t('controlPanel.hidMouseTooltip')} block>
                            <ToggleRow
                                checked={!!config.hidMouse}
                                onChange={(v) => handleChange('hidMouse', v)}
                                icon={Mouse}
                                label={t('controlPanel.hidMouse')}
                            />
                        </Tooltip>
                        {#if config.hidKeyboard || config.hidMouse}
                            <Tooltip text={t('controlPanel.pureHidTooltip')} block>
                                <ToggleRow
                                    checked={!!config.otgPure}
                                    onChange={(v) => handleChange('otgPure', v)}
                                    label={t('controlPanel.pureHid')}
                                />
                            </Tooltip>
                        {/if}
                    </div>
                </div>

                <div
                    class="space-y-2.5"
                    aria-disabled={!!config.otgPure}
                    inert={config.otgPure ? true : undefined}
                    style={config.otgPure ? 'opacity: 0.45' : 'opacity: 1'}
                >
                    <PerformanceGrid {config} {handleChange} {rendererOptions} />
                    <SliderRow
                        label={t('controlPanel.bitrate')}
                        value={config.bitrate || 8}
                        min={1}
                        max={50}
                        format={(v) => `${v}M`}
                        onChange={(v) => handleChange('bitrate', v)}
                    />
                </div>
            {/if}

            {#if config.sessionMode === 'camera'}
                <div class="space-y-3">
                    <div class="ds-panel p-3.5 flex items-center gap-3.5">
                        <div class="ds-inset flex items-center justify-center shrink-0" style="width: 34px; height: 34px; color: var(--primary)">
                            <Video size={15} />
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center justify-between gap-2">
                                <h4 class="ds-label ds-strong">{t('controlPanel.webcamProTip')}</h4>
                                <a href="https://obsproject.com/" target="_blank" rel="noopener noreferrer" class="ds-link flex items-center gap-1 shrink-0">
                                    {t('controlPanel.getObs')} <ExternalLink size={10} />
                                </a>
                            </div>
                            <p class="ds-caption mt-[3px]" style="color: var(--text-secondary)">
                                {t('controlPanel.webcamProTipTextBefore')}
                                <span class="ds-strong">{t('controlPanel.webcamProTipObs')}</span>
                                {t('controlPanel.webcamProTipAndStart')}
                                <span class="ds-strong">{t('controlPanel.webcamProTipVirtualCamera')}</span>
                                {t('controlPanel.webcamProTipTextAfter')}
                            </p>
                        </div>
                    </div>

                    <div class="space-y-1">
                        <div class="flex justify-between items-center">
                            <div class="flex items-center gap-1.5">
                                <span class="ds-label">{t('controlPanel.cameraDevice')}</span>
                                <Tooltip text={t('controlPanel.cameraDeviceTooltip')} placement="top" />
                            </div>
                            <div class="flex items-center gap-1.5">
                                <Tooltip text={t('controlPanel.refreshLensesTooltip')} placement="top" />
                                <button type="button" onclick={() => onListOptions('--list-cameras')} class="ds-btn-tertiary">
                                    {t('controlPanel.refreshLenses')}
                                </button>
                            </div>
                        </div>
                        <Select
                            value={config.cameraId || ''}
                            onChange={(val) => handleChange('cameraId', val)}
                            ariaLabel={t('controlPanel.cameraDevice')}
                            options={[
                                { value: '', label: t('controlPanel.autoSelect') },
                                ...detectedCameras.map(cam => ({ value: cam.id, label: cam.name }))
                            ]}
                            triggerClassName="cp-select"
                            optionClassName="cp-opt"
                            customLabel={t('controlPanel.custom')}
                        />
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <Select
                            label={t('controlPanel.codec')}
                            value={config.codec || 'h264'}
                            onChange={(val) => handleChange('codec', val)}
                            options={[
                                { value: 'h264', label: 'H.264' },
                                { value: 'h265', label: 'H.265' },
                                { value: 'av1', label: 'AV1' }
                            ]}
                            triggerClassName="cp-select"
                            optionClassName="cp-opt"
                            customLabel={t('controlPanel.custom')}
                        />
                        <Select
                            label={t('controlPanel.aspect')}
                            value={config.cameraAr || '0'}
                            onChange={(val) => handleChange('cameraAr', val)}
                            options={[
                                { value: '0', label: t('controlPanel.aspectDefault') },
                                { value: '16:9', label: '16:9' },
                                { value: '4:3', label: '4:3' }
                            ]}
                            triggerClassName="cp-select"
                            optionClassName="cp-opt"
                            customLabel={t('controlPanel.custom')}
                        />
                    </div>

                    <div class="ds-panel p-2.5 space-y-2">
                        <div class="flex items-center gap-2">
                            <span class="ds-caption" style="color: var(--text-muted)">{t('controlPanel.cameraControls')}</span>
                            <span class="ds-badge">{t('controlPanel.badgeNew')}</span>
                        </div>
                        <Tooltip text={t('controlPanel.cameraTorchTooltip')} block>
                            <ToggleRow
                                checked={!!config.cameraTorch}
                                onChange={(v) => handleChange('cameraTorch', v)}
                                label={t('controlPanel.cameraTorch')}
                            />
                        </Tooltip>
                        <SliderRow
                            label={t('controlPanel.cameraZoom')}
                            tooltip={t('controlPanel.cameraZoomTooltip')}
                            value={config.cameraZoom || 1.0}
                            min={1}
                            max={5}
                            step={0.1}
                            format={(v) => `${v.toFixed(1)}x`}
                            onChange={(v) => handleChange('cameraZoom', v)}
                        />
                    </div>

                    <div class="space-y-2.5">
                        <PerformanceGrid
                            {config}
                            {handleChange}
                            {rendererOptions}
                            showCodec={false}
                            showResolution={false}
                        />
                        <SliderRow
                            label={t('controlPanel.bitrate')}
                            value={config.bitrate || 8}
                            min={1}
                            max={50}
                            format={(v) => `${v}M`}
                            onChange={(v) => handleChange('bitrate', v)}
                        />
                    </div>
                </div>
            {/if}

            {#if config.sessionMode === 'desktop'}
                <div class="space-y-3">
                    <div class="ds-panel p-3 space-y-4">
                        <div class="flex items-center justify-between" style="border-bottom: 1px solid var(--border-base); padding-bottom: 8px">
                            <div class="flex items-center gap-2">
                                <Settings2 size={12} />
                                <h3 class="ds-label ds-strong">{t('controlPanel.virtualDisplayEngine')}</h3>
                            </div>
                            <div class="flex items-center gap-2">
                                <Tooltip text={t('controlPanel.flexDisplayTooltip')}>
                                    <button
                                        type="button"
                                        aria-pressed={!!config.flexDisplay}
                                        onclick={() => handleChange('flexDisplay', !config.flexDisplay)}
                                        class="ds-btn-tertiary"
                                        style={config.flexDisplay ? 'color: var(--primary)' : undefined}
                                        title={t('controlPanel.flexDisplay')}
                                    >
                                        <span class="ds-badge" data-live={config.flexDisplay ? 'true' : 'false'}>{t('controlPanel.flexDisplay')}</span>
                                    </button>
                                </Tooltip>
                                <button
                                    type="button"
                                    aria-pressed={!!config.aspectRatioLock}
                                    onclick={() => handleChange('aspectRatioLock', !config.aspectRatioLock)}
                                    class="ds-btn-tertiary"
                                    style={config.aspectRatioLock ? 'color: var(--primary)' : undefined}
                                    title={t('controlPanel.ratioLockTitle')}
                                >
                                    {#if config.aspectRatioLock}<Lock size={10} />{:else}<Unlock size={10} />{/if}
                                    <span>{t('controlPanel.ratioLock')}</span>
                                </button>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                            <SliderRow
                                label={t('controlPanel.width')}
                                value={config.vdWidth || 1920}
                                min={480}
                                max={3840}
                                format={(v) => `${v}px`}
                                onChange={(val) => {
                                    if (config.aspectRatioLock && config.vdWidth && config.vdHeight) {
                                        const ratio = config.vdHeight / config.vdWidth;
                                        setConfig({ ...config, vdWidth: val, vdHeight: Math.round(val * ratio) });
                                    } else {
                                        handleChange('vdWidth', val);
                                    }
                                }}
                            />
                            <SliderRow
                                label={t('controlPanel.height')}
                                value={config.vdHeight || 1080}
                                min={360}
                                max={2160}
                                format={(v) => `${v}px`}
                                onChange={(val) => {
                                    if (config.aspectRatioLock && config.vdWidth && config.vdHeight) {
                                        const ratio = config.vdWidth / config.vdHeight;
                                        setConfig({ ...config, vdHeight: val, vdWidth: Math.round(val * ratio) });
                                    } else {
                                        handleChange('vdHeight', val);
                                    }
                                }}
                            />
                            <SliderRow
                                label={t('controlPanel.uiScaling')}
                                tooltip={t('controlPanel.uiScalingTooltip')}
                                value={config.vdDpi || 420}
                                min={120}
                                max={640}
                                format={(v) => `${v} DPI`}
                                onChange={(val) => handleChange('vdDpi', val)}
                            />
                            <Select
                                label={t('controlPanel.quickPresets')}
                                value={vdPreset}
                                onChange={(val) => {
                                    if (val === '1080p') setConfig({ ...config, vdWidth: 1920, vdHeight: 1080 });
                                    if (val === '1440p') setConfig({ ...config, vdWidth: 2560, vdHeight: 1440 });
                                    if (val === '4k') setConfig({ ...config, vdWidth: 3840, vdHeight: 2160 });
                                    if (val === 'ultrawide') setConfig({ ...config, vdWidth: 2560, vdHeight: 1080 });
                                }}
                                options={[
                                    { value: '1080p', label: t('controlPanel.preset1080p') },
                                    { value: '1440p', label: t('controlPanel.preset1440p') },
                                    { value: '4k', label: t('controlPanel.preset4k') },
                                    { value: 'ultrawide', label: t('controlPanel.presetUltrawide') }
                                ]}
                                triggerClassName="cp-select"
                                optionClassName="cp-opt"
                                customLabel={t('controlPanel.custom')}
                            />
                        </div>
                    </div>

                    <div class="space-y-2.5">
                        <PerformanceGrid {config} {handleChange} {rendererOptions} showResolution={false} />
                        <SliderRow
                            label={t('controlPanel.bitrate')}
                            value={config.bitrate || 8}
                            min={1}
                            max={50}
                            format={(v) => `${v}M`}
                            onChange={(v) => handleChange('bitrate', v)}
                        />
                        <div class="space-y-1">
                            <div class="flex items-center gap-1.5">
                                <label class="ds-label" for="cp-background-color">{t('controlPanel.backgroundColor')}</label>
                                <Tooltip text={t('controlPanel.backgroundColorTooltip')} placement="top" />
                            </div>
                            <div class="flex items-center gap-2">
                                <div
                                    class="shrink-0"
                                    style="width: 20px; height: 20px; border-radius: var(--radius-sm); border: 1px solid var(--border-base); background-color: {config.backgroundColor || '#222222'}"
                                ></div>
                                <input
                                    id="cp-background-color"
                                    type="text"
                                    placeholder="#1a1a1a"
                                    value={config.backgroundColor || ''}
                                    oninput={(e) => handleChange('backgroundColor', (e.currentTarget as HTMLInputElement).value)}
                                    class="ds-input flex-1 font-mono"
                                />
                                {#if config.backgroundColor}
                                    <button type="button" onclick={() => handleChange('backgroundColor', '')} class="ds-btn-tertiary">
                                        {t('controlPanel.backgroundColorNone')}
                                    </button>
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            {#if config.sessionMode === 'mic'}
                <div class="space-y-3">
                    <div class="ds-panel p-3 space-y-3">
                        <div class="flex items-center gap-2" style="border-bottom: 1px solid var(--border-base); padding-bottom: 8px">
                            <Mic size={12} />
                            <h3 class="ds-label ds-strong">{t('controlPanel.micBridgeTitle')}</h3>
                            {#if isRunning}
                                <span class="ds-caption" style="margin-left: auto; color: var(--success, var(--primary))">{t('controlPanel.micActive')}</span>
                            {/if}
                        </div>

                        <MicMeter sessionRunning={isRunning} />

                        <div class="grid grid-cols-2 gap-x-4 gap-y-3">
                            <Select
                                label={t('controlPanel.micSourceLabel')}
                                value={config.micSource || 'mic'}
                                onChange={(val) => handleChange('micSource', val)}
                                options={[
                                    { value: 'mic', label: t('controlPanel.micSourceMic') },
                                    { value: 'mic-voice-communication', label: t('controlPanel.micSourceVoiceComm') }
                                ]}
                                triggerClassName="cp-select"
                                optionClassName="cp-opt"
                                customLabel={t('controlPanel.custom')}
                            />
                            <Select
                                label={t('controlPanel.micQualityLabel')}
                                value={String(config.micBitrate || 128)}
                                onChange={(val) => handleChange('micBitrate', Number(val))}
                                options={[
                                    { value: '64', label: '64 kbps' },
                                    { value: '128', label: '128 kbps' },
                                    { value: '192', label: '192 kbps' },
                                    { value: '256', label: '256 kbps' }
                                ]}
                                triggerClassName="cp-select"
                                optionClassName="cp-opt"
                                customLabel={t('controlPanel.custom')}
                            />
                            <Select
                                label={t('controlPanel.micCodecLabel')}
                                value={config.micCodec || 'opus'}
                                onChange={(val) => handleChange('micCodec', val)}
                                options={[
                                    { value: 'opus', label: 'Opus' },
                                    { value: 'aac', label: 'AAC' }
                                ]}
                                triggerClassName="cp-select"
                                optionClassName="cp-opt"
                                customLabel={t('controlPanel.custom')}
                            />
                            <div class="flex items-end">
                                <button
                                    type="button"
                                    aria-pressed={!!config.micDenoise}
                                    onclick={() => handleChange('micDenoise', !config.micDenoise)}
                                    class="ds-btn-tertiary"
                                    style={config.micDenoise ? 'color: var(--primary)' : undefined}
                                    title={t('controlPanel.micDenoiseTooltip')}
                                >
                                    <span>{t('controlPanel.micDenoiseLabel')}</span>
                                </button>
                            </div>
                        </div>

                        <p class="ds-caption" style="color: var(--text-secondary); line-height: 1.5">{t('controlPanel.micBridgeDesc')}</p>
                        <div class="ds-caption" style="color: var(--text-muted); line-height: 1.5; display: grid; gap: 6px">
                            <span>{t('controlPanel.micAndroidReq')}</span>
                            <span>{t('controlPanel.micDestLinux')}</span>
                            <span>{t('controlPanel.micDestOther')}</span>
                        </div>
                    </div>
                    <p class="ds-caption" style="color: var(--text-muted); line-height: 1.5">
                        {isRunning ? t('controlPanel.micStopHint') : t('controlPanel.micStartHint')}
                    </p>
                </div>
            {/if}
        </div>
    </section>

    <div class="pt-2">
        {#if !isRunning}
            <button
                type="button"
                onclick={onStart}
                disabled={isStarting}
                aria-busy={isStarting}
                class="ds-btn ds-btn-primary w-full"
                style="padding: 12px 16px"
            >
                <span class="flex items-center justify-center gap-3">
                    <Play size={18} />
                    {config.sessionMode === 'mirror'
                        ? (config.hidKeyboard || config.hidMouse) && config.otgPure
                            ? t('controlPanel.initializeOtg')
                            : t('controlPanel.startMission')
                        : config.sessionMode === 'camera'
                          ? t('controlPanel.engageCamera')
                          : config.sessionMode === 'mic'
                            ? t('controlPanel.startMicBridge')
                            : t('controlPanel.ejectToDesktop')}
                </span>
            </button>
        {:else}
            <button type="button" onclick={onStop} class="ds-btn ds-btn-danger w-full" style="padding: 12px 16px">
                <span class="flex items-center justify-center gap-3">
                    <Square size={18} />
                    {t('controlPanel.stopSession')}
                </span>
            </button>
        {/if}
    </div>
</main>
