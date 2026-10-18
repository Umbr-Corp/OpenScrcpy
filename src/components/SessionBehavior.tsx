import { open } from '@tauri-apps/plugin-dialog';
import { ScrcpyConfig } from '../hooks/useScrcpy';
import Tooltip from './Tooltip';
import Select from './Select';
import { Coffee, MonitorOff, Volume2, Layers, Maximize, Square, Circle, Folder, Settings2, ActivitySquare, Move } from 'lucide-react';
import { useI18n } from '../i18n';

const AUDIO_CODEC_VALUES = ['auto', 'opus', 'aac', 'flac', 'raw'] as const;
type AudioCodec = typeof AUDIO_CODEC_VALUES[number];

const AUDIO_CODEC_LABEL_KEY: Record<AudioCodec, string> = {
    auto: 'sessionBehavior.audioCodecAuto',
    opus: 'sessionBehavior.audioCodecOpus',
    aac: 'sessionBehavior.audioCodecAac',
    flac: 'sessionBehavior.audioCodecFlac',
    raw: 'sessionBehavior.audioCodecRaw',
};

interface SessionBehaviorProps {
    config: ScrcpyConfig;
    setConfig: (c: ScrcpyConfig) => void;
}

// Hover states for custom rows use Settings tokens only (no extra hues).
const dsHoverStyles = `
.sb-row { border: 1px solid transparent; border-radius: var(--radius-md); }
.sb-row:hover { border-color: var(--primary); }
.sb-select:hover { border-color: var(--primary); }
.sb-opt { border: 1px solid transparent; }
.sb-opt:hover { border-color: var(--primary); }
`;

// Module scope on purpose: a component declared inside SessionBehavior's body
// gets a new type on every config change (a toggle click re-renders the
// parent), remounting the subtree -- killing the picker's open state and the
// keyboard focus on the very switch the user just pressed.
const Toggle = ({ checked, onChange, icon: Icon, label, tooltip }: { checked: boolean, onChange: (v: boolean) => void, icon: any, label: string, tooltip: string }) => (
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
        className="sb-row flex items-center justify-between gap-3 cursor-pointer py-1 px-2"
    >
        <div className="flex items-center gap-2 min-w-0">
            <span className="ds-inset flex items-center justify-center shrink-0" style={{ padding: 4, color: checked ? 'var(--primary)' : 'var(--text-muted)' }}>
                <Icon size={12} />
            </span>
            <span className="ds-label">
                {label}
            </span>
            <span className="shrink-0">
                <Tooltip text={tooltip} />
            </span>
        </div>
        <span className="ds-toggle shrink-0" data-on={checked ? 'true' : 'false'} aria-hidden="true">
            <span />
        </span>
    </div>
);

const AudioCodecSelect = ({ value, onChange, disabled }: { value: AudioCodec, onChange: (v: AudioCodec) => void, disabled: boolean }) => {
    const { t } = useI18n();
    return (
        <div
            aria-disabled={disabled}
            className="pr-2 pb-1"
            style={{ marginTop: 2, paddingLeft: 28, opacity: disabled ? 0.45 : 1 }}
        >
            <div className="flex items-center gap-1.5">
                <span className="ds-caption" style={{ color: 'var(--text-muted)' }}>{t('sessionBehavior.audioCodec')}</span>
                <Tooltip text={t('sessionBehavior.audioCodecTooltip')} />
                <div className="relative ml-auto">
                    <Select
                        value={value}
                        onChange={(v) => onChange(v as AudioCodec)}
                        options={AUDIO_CODEC_VALUES.map((opt) => ({ value: opt, label: t(AUDIO_CODEC_LABEL_KEY[opt]) }))}
                        ariaLabel={t('sessionBehavior.audioCodec')}
                        disabled={disabled}
                        triggerClassName="sb-select"
                        optionClassName="sb-opt"
                    />
                </div>
            </div>
        </div>
    );
};

export default function SessionBehavior({ config, setConfig }: SessionBehaviorProps) {
    const { t } = useI18n();

    const handleChange = (field: keyof ScrcpyConfig, value: any) => {
        // The full config (including recordPath) is persisted by useScrcpy's
        // config effect; this used to also duplicate one field into its own
        // localStorage key that nothing ever read back.
        setConfig({ ...config, [field]: value });
    };

    const handlePickFolder = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: t('sessionBehavior.selectRecordingFolderTitle')
            });
            if (selected) {
                handleChange('recordPath', selected);
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="space-y-4">
            <style>{dsHoverStyles}</style>
            <div className="ds-card p-3 space-y-2">
                <div className="flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-base)', paddingBottom: 8 }}>
                    <Settings2 size={12} style={{ color: 'var(--text-muted)' }} />
                    <h2 className="ds-label ds-strong">{t('sessionBehavior.title')}</h2>
                </div>

                <div className="flex flex-col gap-1">
                    <Toggle
                        checked={config.stayAwake || false}
                        onChange={(v) => handleChange('stayAwake', v)}
                        icon={Coffee}
                        label={t('sessionBehavior.stayAwake')}
                        tooltip={t('sessionBehavior.stayAwakeTooltip')}
                    />
                    {/* v4: Keep Active */}
                    <Toggle
                        checked={config.keepActive || false}
                        onChange={(v) => handleChange('keepActive', v)}
                        icon={ActivitySquare}
                        label={t('sessionBehavior.keepActive')}
                        tooltip={t('sessionBehavior.keepActiveTooltip')}
                    />
                    <Toggle
                        checked={config.turnOff || false}
                        onChange={(v) => handleChange('turnOff', v)}
                        icon={MonitorOff}
                        label={t('sessionBehavior.screenOff')}
                        tooltip={t('sessionBehavior.screenOffTooltip')}
                    />
                    <div>
                        <Toggle
                            checked={config.audioEnabled || false}
                            onChange={(v) => handleChange('audioEnabled', v)}
                            icon={Volume2}
                            label={t('sessionBehavior.forwardAudio')}
                            tooltip={t('sessionBehavior.forwardAudioTooltip')}
                        />
                        {config.audioEnabled && (
                            <AudioCodecSelect
                                value={(AUDIO_CODEC_VALUES.includes((config.audioCodec as AudioCodec)) ? config.audioCodec : 'auto') as AudioCodec}
                                onChange={(v) => handleChange('audioCodec', v)}
                                disabled={!config.audioEnabled}
                            />
                        )}
                    </div>
                    <Toggle
                        checked={config.alwaysOnTop || false}
                        onChange={(v) => handleChange('alwaysOnTop', v)}
                        icon={Layers}
                        label={t('sessionBehavior.alwaysOnTop')}
                        tooltip={t('sessionBehavior.alwaysOnTopTooltip')}
                    />
                    <Toggle
                        checked={config.fullscreen || false}
                        onChange={(v) => handleChange('fullscreen', v)}
                        icon={Maximize}
                        label={t('sessionBehavior.fullScreen')}
                        tooltip={t('sessionBehavior.fullScreenTooltip')}
                    />
                    <Toggle
                        checked={config.borderless || false}
                        onChange={(v) => handleChange('borderless', v)}
                        icon={Square}
                        label={t('sessionBehavior.borderless')}
                        tooltip={t('sessionBehavior.borderlessTooltip')}
                    />
                    <Toggle
                        checked={config.rememberWindowPosition !== false}
                        onChange={(v) => handleChange('rememberWindowPosition', v)}
                        icon={Move}
                        label={t('sessionBehavior.rememberWindowPosition')}
                        tooltip={t('sessionBehavior.rememberWindowPositionTooltip')}
                    />
                    <Toggle
                        checked={config.record || false}
                        onChange={(v) => handleChange('record', v)}
                        icon={Circle}
                        label={t('sessionBehavior.recordFeed')}
                        tooltip={t('sessionBehavior.recordFeedTooltip')}
                    />
                </div>

                <div className="pt-2 space-y-2" style={{ borderTop: '1px solid var(--border-base)' }}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <Folder size={12} style={{ color: 'var(--text-muted)' }} />
                            <span className="ds-label">{t('sessionBehavior.recordPath')}</span>
                        </div>
                        <button
                            type="button"
                            onClick={handlePickFolder}
                            className="ds-btn-tertiary"
                        >
                            {t('sessionBehavior.change')}
                        </button>
                    </div>
                    <div className="ds-inset px-2.5 py-1.5">
                        <p className="ds-caption font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                            {config.recordPath || t('sessionBehavior.defaultVideosFolder')}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
