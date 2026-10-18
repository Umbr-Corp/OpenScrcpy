import { Play, Square, Monitor, Camera, LayoutGrid, Lock, Unlock, Settings2, Video, ExternalLink, Keyboard, Mouse } from 'lucide-react';
import { RenderDriverSupport, ScrcpyConfig } from '../../hooks/useScrcpy';
import Tooltip from '../Tooltip';
import Select from '../Select';
import SliderRow from '../SliderRow';
import { buildRendererOptions, mapRendererSelection } from './rendererOptions';
import { useI18n } from '../../i18n';

interface ControlPanelProps {
    config: ScrcpyConfig;
    setConfig: (c: ScrcpyConfig) => void;
    onStart: () => void;
    onStop: () => void;
    isRunning: boolean;
    onListOptions: (arg: string) => void;
    detectedCameras?: { id: string, name: string }[];
    renderDriverSupport?: RenderDriverSupport;
}

// Hover states for custom rows use Settings tokens only (no extra hues).
const dsHoverStyles = `
.cp-row { border: 1px solid var(--border-base); border-radius: var(--radius-md); background: var(--bg-surface); transition: background 0.09s ease-out, border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
.cp-row:hover { border-color: var(--primary); background: var(--bg-input); }
.cp-select:hover { border-color: var(--primary); }
.cp-opt { border: 1px solid transparent; }
.cp-opt:hover { border-color: var(--primary); }
`;

interface ToggleRowProps {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    hint?: string;
    icon?: any;
}

// Single settings toggle row: label on the left, .ds-toggle on the right.
// Keyboard accessible (role="switch"); hover uses the primary border token.
const ToggleRow = ({ checked, onChange, label, hint, icon: Icon }: ToggleRowProps) => (
    <div
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChange(!checked);
            }
        }}
        className="cp-row flex items-center justify-between gap-3 cursor-pointer px-3 py-2"
    >
        <div className="flex items-center gap-2 min-w-0">
            {Icon && (
                <span style={{ color: checked ? 'var(--primary)' : 'var(--text-muted)' }} className="flex items-center shrink-0">
                    <Icon size={12} />
                </span>
            )}
            <span className="ds-label truncate">{label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
            {hint && <span className="ds-badge">{hint}</span>}
            <span className="ds-toggle" data-on={checked ? 'true' : 'false'} aria-hidden="true">
                <span />
            </span>
        </div>
    </div>
);

// Resolution / codec / fps / rotation / renderer grid, shared by the three
// session modes with selective hiding. Module scope: a dropdown declared
// inside the parent's body would remount (and close) on every parent render,
// e.g. the 5s background device poll in App.
const PerformanceGrid = ({
    config,
    handleChange,
    rendererOptions,
    showResolution = true,
    showCodec = true
}: {
    config: ScrcpyConfig;
    handleChange: (field: keyof ScrcpyConfig, value: any) => void;
    rendererOptions: { value: string; label: string }[];
    showResolution?: boolean;
    showCodec?: boolean;
}) => {
    const { t } = useI18n();
    const selectClassNames = {
        triggerClassName: 'cp-select',
        optionClassName: 'cp-opt',
        customLabel: t('controlPanel.custom')
    };

    return (
        <div className="space-y-2">
            <div className={`grid ${showResolution ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                {showResolution && (
                    <Select
                        label={t('controlPanel.resolution')}
                        value={config.res || "0"}
                        onChange={(val) => handleChange('res', val)}
                        options={[
                            { value: "0", label: t('controlPanel.resolutionOriginal') },
                            { value: "3840", label: "4K" },
                            { value: "2560", label: "2K" },
                            { value: "1920", label: "1080p" },
                            { value: "1600", label: "900p" },
                            { value: "1280", label: "720p" },
                            { value: "1024", label: "576p" },
                            { value: "800", label: "480p" },
                        ]}
                        {...selectClassNames}
                    />
                )}
                {showCodec && (
                    <Select
                        label={t('controlPanel.codec')}
                        value={config.codec || "h264"}
                        onChange={(val) => handleChange('codec', val)}
                        options={[
                            { value: "h264", label: "H.264" },
                            { value: "h265", label: "H.265" },
                            { value: "av1", label: "AV1" },
                            { value: "vp8", label: "VP8" },
                            { value: "vp9", label: "VP9" },
                        ]}
                        {...selectClassNames}
                    />
                )}
                <Select
                    label={t('controlPanel.fps')}
                    value={config.fps === undefined || config.fps === null ? 0 : config.fps}
                    onChange={(val) => handleChange('fps', parseInt(val) === 0 ? undefined : parseInt(val))}
                    options={[
                        { value: 0, label: t('controlPanel.rendererAuto') || "Automatic" },
                        { value: 30, label: "30" },
                        { value: 60, label: "60" },
                        { value: 90, label: "90" },
                        { value: 120, label: "120" },
                    ]}
                    {...selectClassNames}
                />
                <Select
                    label={t('controlPanel.rotation')}
                    value={config.rotation || "0"}
                    onChange={(val) => handleChange('rotation', val)}
                    options={[
                        { value: "0", label: "0°" },
                        { value: "270", label: "-90°" },
                        { value: "90", label: "+90°" },
                        { value: "180", label: "180°" },
                    ]}
                    {...selectClassNames}
                />
                <Select
                    label={t('controlPanel.graphicsRenderer')}
                    value={config.renderDriver || 'auto'}
                    onChange={(val) => handleChange('renderDriver', mapRendererSelection(val))}
                    options={rendererOptions}
                    {...selectClassNames}
                />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <Tooltip text={t('controlPanel.vsyncTooltip')} block>
                    <ToggleRow
                        checked={config.vsync !== false}
                        onChange={(v) => handleChange('vsync', v)}
                        label={t('controlPanel.vsync')}
                        hint={t('controlPanel.vsyncHint')}
                    />
                </Tooltip>
                {/* v4.1: ignore encoder constraints */}
                <Tooltip text={t('controlPanel.ignoreEncoderConstraintsTooltip')} block>
                    <ToggleRow
                        checked={!!config.ignoreVideoEncoderConstraints}
                        onChange={(v) => handleChange('ignoreVideoEncoderConstraints', v)}
                        label={t('controlPanel.ignoreEncoderConstraints')}
                        hint="v4.1"
                    />
                </Tooltip>
            </div>
        </div>
    );
};

export default function ControlPanel({
    config,
    setConfig,
    onStart,
    onStop,
    isRunning,
    onListOptions,
    detectedCameras = [],
    renderDriverSupport = { hostOs: 'unknown', supportsRenderDriver: false, supportedDrivers: [] }
}: ControlPanelProps) {
    const { t } = useI18n();

    const handleChange = (field: keyof ScrcpyConfig, value: any) => {
        setConfig({ ...config, [field]: value });
    };

    const rendererOptions = buildRendererOptions(renderDriverSupport, t('controlPanel.rendererAuto'));
    const selectClassNames = {
        triggerClassName: 'cp-select',
        optionClassName: 'cp-opt',
        customLabel: t('controlPanel.custom')
    };

    return (
        <main className="lg:col-span-6 space-y-4">
            <style>{dsHoverStyles}</style>
            <section className="ds-card p-3">
                <span className="ds-label block" style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>{t('controlPanel.captureSource')}</span>
                <div className="ds-tabs" role="tablist" aria-label={t('controlPanel.captureSource')}>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={config.sessionMode === 'mirror'}
                        data-active={config.sessionMode === 'mirror' ? 'true' : 'false'}
                        onClick={() => handleChange('sessionMode', 'mirror')}
                        className="ds-tab"
                    >
                        <Monitor size={16} />
                        <span>{t('controlPanel.screen')}</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={config.sessionMode === 'camera'}
                        data-active={config.sessionMode === 'camera' ? 'true' : 'false'}
                        onClick={() => handleChange('sessionMode', 'camera')}
                        className="ds-tab"
                    >
                        <Camera size={16} />
                        <span>{t('controlPanel.camera')}</span>
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={config.sessionMode === 'desktop'}
                        data-active={config.sessionMode === 'desktop' ? 'true' : 'false'}
                        onClick={() => handleChange('sessionMode', 'desktop')}
                        className="ds-tab"
                    >
                        <LayoutGrid size={16} />
                        <span>{t('controlPanel.desktop')}</span>
                    </button>
                </div>
            </section>

            <section className="ds-card p-3 space-y-3">
                <div className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--border-base)', paddingBottom: 8 }}>
                    <h2 className="ds-label ds-strong">{t('controlPanel.engineConfiguration')}</h2>
                    <div className="flex gap-1.5">
                        {config.sessionMode === 'mirror' && (config.hidKeyboard || config.hidMouse) && config.otgPure && (
                            <span className="ds-badge">
                                {t('controlPanel.otgOnly')}
                            </span>
                        )}
                        <span className="ds-badge" data-live={isRunning ? 'true' : 'false'}>
                            {isRunning ? t('controlPanel.active') : t('controlPanel.ready')}
                        </span>
                    </div>
                </div>

                <div className="space-y-2.5">
                    {/* Screen Config */}
                    {config.sessionMode === 'mirror' && (
                        <>
                            <div className="ds-panel p-3 space-y-3">
                                <div className="flex items-center gap-2">
                                    <Keyboard size={12} style={{ color: 'var(--primary)' }} />
                                    <span className="ds-label ds-strong">{t('controlPanel.inputEnhancements')}</span>
                                </div>
                                <p className="ds-caption" style={{ color: 'var(--text-secondary)' }}>
                                    {t('controlPanel.inputEnhancementsDescription')}
                                </p>

                                <div className="grid grid-cols-2 gap-3">
                                    {/* HID Keyboard */}
                                    <Tooltip text={t('controlPanel.hidKeyboardTooltip')} block>
                                        <ToggleRow
                                            checked={!!config.hidKeyboard}
                                            onChange={(v) => handleChange('hidKeyboard', v)}
                                            icon={Keyboard}
                                            label={t('controlPanel.hidKeyboard')}
                                        />
                                    </Tooltip>

                                    {/* HID Mouse */}
                                    <Tooltip text={t('controlPanel.hidMouseTooltip')} block>
                                        <ToggleRow
                                            checked={!!config.hidMouse}
                                            onChange={(v) => handleChange('hidMouse', v)}
                                            icon={Mouse}
                                            label={t('controlPanel.hidMouse')}
                                        />
                                    </Tooltip>

                                    {/* Advanced: Pure HID (Old OTG Pure) */}
                                    {(config.hidKeyboard || config.hidMouse) && (
                                        <Tooltip text={t('controlPanel.pureHidTooltip')} block>
                                            <ToggleRow
                                                checked={!!config.otgPure}
                                                onChange={(v) => handleChange('otgPure', v)}
                                                label={t('controlPanel.pureHid')}
                                            />
                                        </Tooltip>
                                    )}
                                </div>
                            </div>

                            <div
                                className="space-y-2.5"
                                aria-disabled={!!config.otgPure}
                                inert={config.otgPure ? true : undefined}
                                style={config.otgPure ? { opacity: 0.45 } : { opacity: 1 }}
                            >
                                <PerformanceGrid
                                    config={config}
                                    handleChange={handleChange}
                                    rendererOptions={rendererOptions}
                                />
                                <SliderRow label={t('controlPanel.bitrate')} value={config.bitrate || 8} min={1} max={50} format={(v) => `${v}M`} onChange={(v) => handleChange('bitrate', v)} />
                            </div>
                        </>
                    )}

                    {/* Camera Config */}
                    {config.sessionMode === 'camera' && (
                        <div className="space-y-3">
                            {/* Webcam Pro Tip */}
                            <div className="ds-panel p-3 flex gap-3">
                                <div className="ds-inset flex items-center justify-center shrink-0" style={{ padding: 6, alignSelf: 'flex-start', color: 'var(--primary)' }}>
                                    <Video size={14} />
                                </div>
                                <div className="space-y-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2">
                                        <h4 className="ds-label ds-strong">{t('controlPanel.webcamProTip')}</h4>
                                        <a
                                            href="https://obsproject.com/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="ds-link flex items-center gap-1 shrink-0"
                                        >
                                            {t('controlPanel.getObs')} <ExternalLink size={10} />
                                        </a>
                                    </div>
                                    <p className="ds-caption" style={{ color: 'var(--text-secondary)' }}>
                                        {t('controlPanel.webcamProTipTextBefore')} <span className="ds-strong">{t('controlPanel.webcamProTipObs')}</span> {t('controlPanel.webcamProTipAndStart')} <span className="ds-strong">{t('controlPanel.webcamProTipVirtualCamera')}</span>{t('controlPanel.webcamProTipTextAfter')}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-1.5">
                                        <span className="ds-label">{t('controlPanel.cameraDevice')}</span>
                                        <Tooltip text={t('controlPanel.cameraDeviceTooltip')} placement="top" />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Tooltip text={t('controlPanel.refreshLensesTooltip')} placement="top" />
                                        <button
                                            type="button"
                                            onClick={() => onListOptions("--list-cameras")}
                                            className="ds-btn-tertiary"
                                        >
                                            {t('controlPanel.refreshLenses')}
                                        </button>
                                    </div>
                                </div>
                                <Select
                                    value={config.cameraId || ""}
                                    onChange={(val) => handleChange('cameraId', val)}
                                    options={[
                                        { value: "", label: t('controlPanel.autoSelect') },
                                        ...detectedCameras.map(cam => ({ value: cam.id, label: cam.name }))
                                    ]}
                                    {...selectClassNames}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <Select
                                    label={t('controlPanel.codec')}
                                    value={config.codec || "h264"}
                                    onChange={(val) => handleChange('codec', val)}
                                    options={[
                                        { value: "h264", label: "H.264" },
                                        { value: "h265", label: "H.265" },
                                        { value: "av1", label: "AV1" },
                                        { value: "vp8", label: "VP8" },
                                        { value: "vp9", label: "VP9" },
                                    ]}
                                    {...selectClassNames}
                                />
                                <Select
                                    label={t('controlPanel.aspect')}
                                    value={config.cameraAr || "0"}
                                    onChange={(val) => handleChange('cameraAr', val)}
                                    options={[
                                        { value: "0", label: t('controlPanel.aspectDefault') },
                                        { value: "16:9", label: "16:9" },
                                        { value: "4:3", label: "4:3" },
                                    ]}
                                    {...selectClassNames}
                                />
                            </div>

                            {/* Camera torch + zoom */}
                            <div className="ds-panel p-2.5 space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="ds-caption" style={{ color: 'var(--text-muted)' }}>{t('controlPanel.cameraControls')}</span>
                                    <span className="ds-badge">{t('controlPanel.badgeNew')}</span>
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

                            <div className="space-y-2.5">
                                <PerformanceGrid
                                    config={config}
                                    handleChange={handleChange}
                                    rendererOptions={rendererOptions}
                                    showCodec={false}
                                    showResolution={false}
                                />
                                <SliderRow label={t('controlPanel.bitrate')} value={config.bitrate || 8} min={1} max={50} format={(v) => `${v}M`} onChange={(v) => handleChange('bitrate', v)} />
                            </div>
                        </div>
                    )}

                    {/* Desktop Config */}
                    {config.sessionMode === 'desktop' && (
                        <div className="space-y-3">
                            <div className="ds-panel p-3 space-y-4">
                                <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-base)', paddingBottom: 8 }}>
                                    <div className="flex items-center gap-2">
                                        <Settings2 size={12} style={{ color: 'var(--primary)' }} />
                                        <h3 className="ds-label ds-strong">{t('controlPanel.virtualDisplayEngine')}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* v4: Flex Display toggle */}
                                        <Tooltip text={t('controlPanel.flexDisplayTooltip')}>
                                            <button
                                                type="button"
                                                aria-pressed={!!config.flexDisplay}
                                                onClick={() => handleChange('flexDisplay', !config.flexDisplay)}
                                                className="ds-btn-tertiary"
                                                style={config.flexDisplay ? { color: 'var(--primary)' } : undefined}
                                                title={t('controlPanel.flexDisplay')}
                                            >
                                                <span className="ds-badge" data-live={config.flexDisplay ? 'true' : 'false'}>
                                                    {t('controlPanel.flexDisplay')}
                                                </span>
                                            </button>
                                        </Tooltip>
                                        <button
                                            type="button"
                                            aria-pressed={!!config.aspectRatioLock}
                                            onClick={() => handleChange('aspectRatioLock', !config.aspectRatioLock)}
                                            className="ds-btn-tertiary"
                                            style={config.aspectRatioLock ? { color: 'var(--primary)' } : undefined}
                                            title={t('controlPanel.ratioLockTitle')}
                                        >
                                            {config.aspectRatioLock ? <Lock size={10} /> : <Unlock size={10} />}
                                            <span>{t('controlPanel.ratioLock')}</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                    <SliderRow
                                        label={t('controlPanel.width')}
                                        value={config.vdWidth || 1920}
                                        min={480} max={3840}
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
                                        min={360} max={2160}
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
                                        value={(() => {
                                            const w = config.vdWidth;
                                            const h = config.vdHeight;
                                            if (w === 1920 && h === 1080) return "1080p";
                                            if (w === 2560 && h === 1440) return "1440p";
                                            if (w === 3840 && h === 2160) return "4k";
                                            if (w === 2560 && h === 1080) return "ultrawide";
                                            return "custom";
                                        })()}
                                        onChange={(val: string) => {
                                            if (val === '1080p') setConfig({ ...config, vdWidth: 1920, vdHeight: 1080 });
                                            if (val === '1440p') setConfig({ ...config, vdWidth: 2560, vdHeight: 1440 });
                                            if (val === '4k') setConfig({ ...config, vdWidth: 3840, vdHeight: 2160 });
                                            if (val === 'ultrawide') setConfig({ ...config, vdWidth: 2560, vdHeight: 1080 });
                                        }}
                                        options={[
                                            { value: "1080p", label: t('controlPanel.preset1080p') },
                                            { value: "1440p", label: t('controlPanel.preset1440p') },
                                            { value: "4k", label: t('controlPanel.preset4k') },
                                            { value: "ultrawide", label: t('controlPanel.presetUltrawide') },
                                        ]}
                                        {...selectClassNames}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2.5">
                                <PerformanceGrid
                                    config={config}
                                    handleChange={handleChange}
                                    rendererOptions={rendererOptions}
                                    showResolution={false}
                                />
                                <SliderRow label={t('controlPanel.bitrate')} value={config.bitrate || 8} min={1} max={50} format={(v) => `${v}M`} onChange={(v) => handleChange('bitrate', v)} />
                                {/* v4: Background Color for Desktop mode */}
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="ds-label">{t('controlPanel.backgroundColor')}</span>
                                        <Tooltip text={t('controlPanel.backgroundColorTooltip')} placement="top" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="shrink-0"
                                            style={{ width: 20, height: 20, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-base)', backgroundColor: config.backgroundColor || '#222222' }}
                                        />
                                        <input
                                            type="text"
                                            placeholder="#1a1a1a"
                                            value={config.backgroundColor || ''}
                                            onChange={(e) => handleChange('backgroundColor', e.target.value)}
                                            className="ds-input flex-1 font-mono"
                                        />
                                        {config.backgroundColor && (
                                            <button type="button" onClick={() => handleChange('backgroundColor', '')} className="ds-btn-tertiary">
                                                {t('controlPanel.backgroundColorNone')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </section>

            <div className="pt-2">
                {!isRunning ? (
                    <button
                        type="button"
                        onClick={onStart}
                        className="ds-btn ds-btn-primary w-full"
                        style={{ padding: '12px 16px' }}
                    >
                        <span className="flex items-center justify-center gap-3">
                            <Play size={18} />
                            {config.sessionMode === 'mirror'
                                ? ((config.hidKeyboard || config.hidMouse) && config.otgPure ? t('controlPanel.initializeOtg') : t('controlPanel.startMission'))
                                : config.sessionMode === 'camera' ? t('controlPanel.engageCamera') : t('controlPanel.ejectToDesktop')}
                        </span>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onStop}
                        className="ds-btn ds-btn-danger w-full"
                        style={{ padding: '12px 16px' }}
                    >
                        <span className="flex items-center justify-center gap-3">
                            <Square size={18} />
                            {t('controlPanel.stopSession')}
                        </span>
                    </button>
                )}
            </div>
        </main>
    );
}
