import { useEffect, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ScrcpyConfig } from '../hooks/useScrcpy';
import Tooltip from './Tooltip';
import { Coffee, MonitorOff, Volume2, Layers, Maximize, Square, Circle, Folder, Settings2, ChevronDown, ActivitySquare, Move } from 'lucide-react';
import { useI18n } from '../i18n';

const AUDIO_CODEC_VALUES = ['auto', 'opus', 'aac', 'flac', 'raw'] as const;
type AudioCodec = typeof AUDIO_CODEC_VALUES[number];

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

export default function SessionBehavior({ config, setConfig }: SessionBehaviorProps) {
    const { t } = useI18n();

    const handleChange = (field: keyof ScrcpyConfig, value: any) => {
        const newConfig = { ...config, [field]: value };
        setConfig(newConfig);
        if (field === 'recordPath') {
            localStorage.setItem('scrcpy_record_path', value);
        }
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

    const AudioCodecPicker = ({ value, onChange, disabled }: { value: AudioCodec, onChange: (v: AudioCodec) => void, disabled: boolean }) => {
        const [isOpen, setIsOpen] = useState(false);
        const ref = useRef<HTMLDivElement>(null);

        useEffect(() => {
            const onDoc = (e: MouseEvent) => {
                if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
            };
            if (isOpen) document.addEventListener('mousedown', onDoc);
            return () => document.removeEventListener('mousedown', onDoc);
        }, [isOpen]);

        useEffect(() => {
            if (disabled) setIsOpen(false);
        }, [disabled]);

        const labelFor = (v: AudioCodec) =>
            v === 'auto' ? t('sessionBehavior.audioCodecAuto') :
                v === 'opus' ? t('sessionBehavior.audioCodecOpus') :
                    v === 'aac' ? t('sessionBehavior.audioCodecAac') :
                        v === 'flac' ? t('sessionBehavior.audioCodecFlac') :
                            t('sessionBehavior.audioCodecRaw');

        return (
            <div
                ref={ref}
                onClick={(e) => e.stopPropagation()}
                aria-disabled={disabled}
                className="pr-2 pb-1"
                style={{ marginTop: 2, paddingLeft: 28, opacity: disabled ? 0.45 : 1 }}
            >
                <div className="flex items-center gap-1.5">
                    <span className="ds-caption" style={{ color: 'var(--text-muted)' }}>{t('sessionBehavior.audioCodec')}</span>
                    <Tooltip text={t('sessionBehavior.audioCodecTooltip')} />
                    <div className="relative ml-auto">
                        <button
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded={isOpen}
                            onClick={() => !disabled && setIsOpen(o => !o)}
                            disabled={disabled}
                            className="ds-input sb-select flex items-center gap-1"
                        >
                            <span>{labelFor(value)}</span>
                            <ChevronDown size={10} style={{ transition: 'transform 0.09s ease-out', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
                        </button>
                        {isOpen && (
                            <div role="listbox" className="ds-panel ds-fade-in absolute right-0 z-50" style={{ marginTop: 4, padding: 4, minWidth: 88 }}>
                                {AUDIO_CODEC_VALUES.map((opt) => (
                                    <button
                                        key={opt}
                                        type="button"
                                        role="option"
                                        aria-selected={value === opt}
                                        onClick={() => { onChange(opt); setIsOpen(false); }}
                                        className="ds-btn-tertiary sb-opt w-full"
                                        style={{
                                            justifyContent: 'flex-start',
                                            ...(value === opt ? { color: 'var(--primary)' } : {})
                                        }}
                                    >
                                        {labelFor(opt)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

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
                <span className="ds-label truncate">
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
                            <AudioCodecPicker
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
