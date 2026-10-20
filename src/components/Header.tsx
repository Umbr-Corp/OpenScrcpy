import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Download, FolderOpen, RefreshCcw, HelpCircle, Info, Heart, X, ExternalLink, Languages, ChevronDown, Sun, Moon, Monitor, Cpu, ArrowUp } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SUPPORTED_LOCALES, useI18n, type Locale } from '../i18n';
import { isTauri } from '../tauri';
import Modal from './Modal';
import { WindowButtons, WINDOW_DRAG_EXCLUDE } from './WindowChrome';

interface HeaderProps {
    colorMode: 'light' | 'dark' | 'system';
    onColorModeChange: (mode: 'light' | 'dark' | 'system') => void;
    binaryStatus: { found: boolean, message: string };
    onDownload: () => void;
    onSetPath: () => void;
    onResetPath: () => void;
    isDownloading: boolean;
    downloadProgress: number;
    version: string;
    /** Latest app release tag when newer than the running build (null otherwise). */
    appUpdateLatest?: string | null;
    onOpenAppUpdate?: () => void;
    onCheckAppUpdate?: () => void;
}

export default function Header({ colorMode, onColorModeChange, binaryStatus, onDownload, onSetPath, onResetPath, isDownloading, downloadProgress, version, appUpdateLatest, onOpenAppUpdate, onCheckAppUpdate }: HeaderProps) {
    const { t, locale, setLocale, translations } = useI18n();
    const [showHelp, setShowHelp] = useState(false);
    const [showAbout, setShowAbout] = useState(false);
    const [showLangMenu, setShowLangMenu] = useState(false);
    const [showEngineMenu, setShowEngineMenu] = useState(false);
    const langMenuRef = useRef<HTMLDivElement>(null);
    const engineMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!showLangMenu && !showEngineMenu) return;
        const onClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (langMenuRef.current && !langMenuRef.current.contains(target)) {
                setShowLangMenu(false);
            }
            if (engineMenuRef.current && !engineMenuRef.current.contains(target)) {
                setShowEngineMenu(false);
            }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [showLangMenu, showEngineMenu]);

    const engineText = isDownloading
        ? t('header.syncingComponents', { progress: downloadProgress })
        : binaryStatus.found
            ? t('header.scrcpyReady')
            : binaryStatus.message;

    // Linux custom titlebar: this header IS the window drag region (the
    // modals it renders, popovers included, opt out via WINDOW_DRAG_EXCLUDE).
    const onHeaderMouseDown = (e: ReactMouseEvent<HTMLElement>) => {
        if (!isTauri() || e.button !== 0) return;
        if ((e.target as HTMLElement).closest(WINDOW_DRAG_EXCLUDE)) return;
        e.preventDefault();
        getCurrentWindow().startDragging().catch(() => { });
    };
    const onHeaderDoubleClick = (e: ReactMouseEvent<HTMLElement>) => {
        if (!isTauri()) return;
        if ((e.target as HTMLElement).closest(WINDOW_DRAG_EXCLUDE)) return;
        getCurrentWindow().toggleMaximize().catch(() => { });
    };

    return (
        <header
            className="flex items-center gap-3 px-4 py-2 flex-nowrap"
            style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-base)' }}
            onMouseDown={onHeaderMouseDown}
            onDoubleClick={onHeaderDoubleClick}
        >
            {showHelp && (
                <Modal
                    isOpen
                    onClose={() => setShowHelp(false)}
                    closeOnBackdrop={false}
                    zIndex={100}
                    label={t('header.manualSetupGuide')}
                    backdropStyle={{ backgroundColor: 'color-mix(in srgb, var(--text-base) 40%, transparent)' }}
                    overlayClassName="p-4"
                    panelClassName="rounded-lg max-w-md w-full p-6"
                >
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="ds-label ds-strong flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
                                <HelpCircle size={16} /> {t('header.manualSetupGuide')}
                            </h3>
                            <button
                                onClick={() => setShowHelp(false)}
                                className="ds-btn ds-btn-tertiary"
                                aria-label={t('common.close')}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-4 ds-body" style={{ color: 'var(--text-secondary)' }}>
                            <p>{t('header.manualSetupIntro')}</p>

                            <ol className="list-decimal list-inside space-y-3">
                                <li>
                                    {t('header.manualStep1')}
                                    <a href="https://github.com/Genymobile/scrcpy/releases/latest" target="_blank" rel="noopener noreferrer" className="ds-link flex items-center gap-1 mt-1 ml-4">
                                        {t('header.manualStep1Link')} <ExternalLink size={10} />
                                    </a>
                                </li>
                                <li>{t('header.manualStep2')}</li>
                                <li>
                                    {t('header.manualStep3Before')}{' '}
                                    <span className="ds-inset rounded-sm inline-flex items-center gap-1 px-1.5 py-0.5 mx-1">
                                        <FolderOpen size={10} /> {t('header.manualStep3Browse')}
                                    </span>{' '}
                                    {t('header.manualStep3After')}
                                </li>
                                <li>{t('header.manualStep4Before')} <code className="ds-strong" style={{ color: 'var(--primary)' }}>{t('header.manualStep4Executable')}</code> {t('header.manualStep4After')}</li>
                            </ol>

                            <div className="pt-3" style={{ borderTop: '1px solid var(--border-base)' }}>
                                <p className="ds-caption" style={{ color: 'var(--text-muted)' }}>{t('header.manualNote')}</p>
                            </div>
                        </div>

                        <button
                            data-autofocus
                            onClick={() => setShowHelp(false)}
                            className="ds-btn ds-btn-primary w-full mt-6"
                        >
                            {t('header.gotIt')}
                        </button>
                </Modal>
            )}

            {showAbout && (
                <Modal
                    isOpen
                    onClose={() => setShowAbout(false)}
                    closeOnBackdrop={false}
                    zIndex={100}
                    label={t('header.aboutTitle')}
                    backdropStyle={{ backgroundColor: 'color-mix(in srgb, var(--text-base) 40%, transparent)' }}
                    overlayClassName="p-4"
                    panelClassName="rounded-lg max-w-md w-full p-6"
                >
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="ds-label ds-strong flex items-center gap-2" style={{ color: 'var(--text-base)' }}>
                                <Info size={16} /> {t('header.aboutTitle')}
                            </h3>
                            <button
                                onClick={() => setShowAbout(false)}
                                className="ds-btn ds-btn-tertiary"
                                aria-label={t('common.close')}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="flex flex-col items-center text-center gap-3">
                            <div className="flex items-center gap-2">
                                <span className="ds-body ds-strong" style={{ fontSize: 20, color: 'var(--text-base)' }}>
                                    OpenScrcpy
                                </span>
                                <span className="ds-badge">V{version}</span>
                            </div>
                            <p className="ds-body" style={{ color: 'var(--text-secondary)' }}>
                                {t('header.aboutDescription')}
                            </p>
                            <div className="flex gap-2 w-full">
                                <a
                                    href="https://github.com/Umbr-Corp/OpenScrcpy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ds-btn ds-btn-secondary flex-1"
                                >
                                    {t('header.aboutRepository')} <ExternalLink size={12} />
                                </a>
                                <a
                                    href="https://github.com/Umbr-Corp/OpenScrcpy/releases"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ds-btn ds-btn-secondary flex-1"
                                >
                                    {t('header.aboutReleases')} <ExternalLink size={12} />
                                </a>
                                <a
                                    href="https://liberapay.com/mryofc/donate"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="ds-btn ds-btn-secondary flex-1"
                                >
                                    <Heart size={12} /> {t('header.aboutDonate')}
                                </a>
                            </div>
                            {onCheckAppUpdate && (
                                <button
                                    onClick={onCheckAppUpdate}
                                    className="ds-btn ds-btn-tertiary w-full"
                                >
                                    <RefreshCcw size={12} /> {t('header.checkAppUpdate')}
                                </button>
                            )}
                            <p className="ds-caption" style={{ color: 'var(--text-muted)' }}>
                                {t('header.aboutLicense')}
                            </p>
                        </div>

                        <button
                            data-autofocus
                            onClick={() => setShowAbout(false)}
                            className="ds-btn ds-btn-primary w-full mt-6"
                        >
                            {t('header.gotIt')}
                        </button>
                </Modal>
            )}

            {/* Brand — left */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <h1 className="ds-body ds-strong" style={{ fontSize: 17, lineHeight: '20px', color: 'var(--text-base)' }}>
                    OpenScrcpy
                </h1>
                <span className="ds-badge">V{version}</span>
                {appUpdateLatest && (
                    <button
                        onClick={onOpenAppUpdate}
                        title={t('header.updateBadge', { v: appUpdateLatest })}
                        aria-label={t('header.updateBadge', { v: appUpdateLatest })}
                        className="ds-badge cursor-pointer flex items-center gap-1"
                        style={{ color: '#E0C559', borderColor: '#E0C559' }}
                    >
                        <ArrowUp size={9} />
                        {t('header.updateBadge', { v: appUpdateLatest })}
                    </button>
                )}
            </div>

            <div className="flex-1" />

            {/* Color mode — icon only */}
            <div className="ds-tabs flex-shrink-0" role="tablist" aria-label={t('header.colorModes.system')}>
                {([
                    { id: 'light' as const, Icon: Sun, label: t('header.colorModes.light') },
                    { id: 'dark' as const, Icon: Moon, label: t('header.colorModes.dark') },
                    { id: 'system' as const, Icon: Monitor, label: t('header.colorModes.system') },
                ] as const).map(({ id, Icon, label }) => (
                    <button
                        key={id}
                        role="tab"
                        aria-selected={colorMode === id}
                        onClick={() => onColorModeChange(id)}
                        title={label}
                        aria-label={label}
                        data-active={colorMode === id}
                        className="ds-tab"
                    >
                        <Icon size={14} />
                    </button>
                ))}
            </div>

            {/* Language — icon + code */}
            <div className="relative flex-shrink-0" ref={langMenuRef}>
                <button
                    onClick={() => setShowLangMenu((v) => !v)}
                    aria-expanded={showLangMenu}
                    aria-haspopup="listbox"
                    className="ds-select-btn flex items-center gap-1.5"
                    title={t('header.languageLabel')}
                >
                    <Languages size={14} />
                    <span className="ds-label">{locale}</span>
                    <ChevronDown size={12} style={{ transform: showLangMenu ? 'rotate(180deg)' : 'none' }} />
                </button>
                {showLangMenu && (
                    <div
                        role="listbox"
                        className="ds-card rounded-md absolute top-full right-0 mt-1 min-w-[160px] z-[120] py-1 ds-fade-in"
                    >
                        {SUPPORTED_LOCALES.map((loc: Locale) => (
                            <button
                                key={loc}
                                role="option"
                                aria-selected={loc === locale}
                                onClick={() => {
                                    setLocale(loc);
                                    setShowLangMenu(false);
                                }}
                                data-active={loc === locale}
                                className="ds-tab w-full justify-start rounded-sm"
                            >
                                {translations.languages[loc]}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Engine — single icon with status dot + popover */}
            <div className="relative flex-shrink-0" ref={engineMenuRef}>
                <button
                    onClick={() => setShowEngineMenu((v) => !v)}
                    aria-expanded={showEngineMenu}
                    aria-haspopup="dialog"
                    className="ds-btn ds-btn-tertiary"
                    style={{ position: 'relative' }}
                    title={`${t('header.scrcpyEngine')}: ${engineText}`}
                    aria-label={`${t('header.scrcpyEngine')}: ${engineText}`}
                >
                    <Cpu size={14} />
                    <span
                        className="ds-dot"
                        data-live={binaryStatus.found}
                        aria-hidden="true"
                        style={{ position: 'absolute', top: 2, right: 2 }}
                    />
                </button>
                {showEngineMenu && (
                    <div
                        role="dialog"
                        aria-label={t('header.scrcpyEngine')}
                        className="ds-card rounded-md absolute top-full right-0 mt-1 z-[120] p-3 ds-fade-in"
                        style={{ width: 240 }}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <span className="ds-dot" data-live={binaryStatus.found} aria-hidden="true" />
                            <span className="ds-caption" style={{ color: 'var(--text-muted)' }}>{t('header.scrcpyEngine')}</span>
                        </div>
                        <p className="ds-label ds-strong truncate mb-2" style={{ color: 'var(--text-base)' }}>
                            {engineText}
                        </p>
                        {isDownloading && (
                            <div
                                className="w-full rounded-full overflow-hidden mb-2"
                                role="progressbar"
                                aria-label={t('header.scrcpyEngine')}
                                aria-valuenow={downloadProgress}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                style={{ backgroundColor: 'var(--bg-input)', height: 4 }}
                            >
                                <div className="h-full" style={{ width: `${downloadProgress}%`, backgroundColor: 'var(--primary)' }} />
                            </div>
                        )}
                        {!binaryStatus.found && !isDownloading && (
                            <button onClick={onDownload} className="ds-btn ds-btn-primary w-full mb-2" disabled={isDownloading}>
                                <Download size={14} /> {t('header.installCore')}
                            </button>
                        )}
                        <div className="flex gap-1 pt-2" style={{ borderTop: '1px solid var(--border-base)' }}>
                            <button onClick={onSetPath} className="ds-btn ds-btn-tertiary flex-1" title={t('header.selectFolder')} aria-label={t('header.selectFolder')}>
                                <FolderOpen size={14} />
                            </button>
                            <button onClick={onResetPath} className="ds-btn ds-btn-tertiary flex-1" title={t('header.resetPath')} aria-label={t('header.resetPath')}>
                                <RefreshCcw size={14} />
                            </button>
                            <button onClick={() => { setShowEngineMenu(false); setShowHelp(true); }} className="ds-btn ds-btn-tertiary flex-1" title={t('header.setupHelpTitle')} aria-label={t('header.setupHelpTitle')}>
                                <HelpCircle size={14} />
                            </button>
                            <button onClick={() => { setShowEngineMenu(false); setShowAbout(true); }} className="ds-btn ds-btn-tertiary flex-1" title={t('header.aboutTitle')} aria-label={t('header.aboutTitle')}>
                                <Info size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {isTauri() && <WindowButtons />}
        </header>
    );
}
