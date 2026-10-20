import { CheckCircle2, Download, Cpu, ArrowRight, X, ExternalLink, HelpCircle, RefreshCcw, AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { useI18n } from '../i18n';

interface OnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
    binaryStatus: { found: boolean; message: string };
    onDownload: () => void;
    isDownloading: boolean;
    downloadProgress: number;
    onComplete: () => void;
    /** Last download failure, already translated; cleared on retry. */
    downloadError?: string | null;
}

export default function OnboardingModal({
    isOpen,
    onClose,
    binaryStatus,
    onDownload,
    isDownloading,
    downloadProgress,
    onComplete,
    downloadError
}: OnboardingModalProps) {
    const { t } = useI18n();
    if (!isOpen) return null;

    const isReady = binaryStatus.found;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            label={t('onboarding.setupCoreComponents')}
            zIndex={200}
            // A stray backdrop click must not throw away a large setup form;
            // X and Escape stay as the deliberate exits.
            closeOnBackdrop={false}
            overlayClassName="p-4"
            panelClassName="w-full max-w-2xl overflow-hidden"
        >
            <div className="absolute top-0 right-0 p-6 z-30">
                <button onClick={onClose} aria-label={t('common.cancel')} className="ds-btn ds-btn-tertiary">
                    <X size={24} />
                </button>
            </div>

            <div className="flex flex-col md:flex-row h-full">
                    {/* Left Side: Branding/Logo */}
                    <div className="hidden md:flex md:w-1/3 p-8 flex-col justify-between relative overflow-hidden" style={{ background: 'var(--bg-input)', borderRight: '1px solid var(--border-base)' }}>
                        <div className="relative z-10">
                            <h2 className="ds-body ds-strong">
                                Open<span style={{ color: 'var(--primary)' }}>Scrcpy</span>
                            </h2>
                            <p className="ds-caption mt-2" style={{ color: 'var(--primary)' }}>{t('onboarding.coreInitialization')}</p>
                        </div>

                        <div className="relative z-10">
                            <div className="ds-inset p-4">
                                <p className="ds-caption" style={{ color: 'var(--text-secondary)' }}>
                                    {t('onboarding.introQuote')}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Setup */}
                    <div className="flex-1 p-8">
                        <div className="mb-10">
                            <h3 className="ds-body ds-strong mb-2">{t('onboarding.setupCoreComponents')}</h3>
                            <p className="ds-caption" style={{ color: 'var(--text-muted)' }}>{t('onboarding.setupCoreSubtitle')}</p>
                        </div>

                        <div className="space-y-8">
                            <div className="flex gap-4">
                                <div className="flex flex-col items-center">
                                    <div className="ds-inset w-10 h-10 rounded-md flex items-center justify-center">
                                        {isReady
                                            ? <CheckCircle2 size={20} style={{ color: 'var(--primary)' }} />
                                            : <Cpu size={20} style={{ color: 'var(--text-muted)' }} />}
                                    </div>
                                </div>

                                <div className="flex-1 pt-1">
                                    <h4 className="ds-label">
                                        {t('onboarding.binariesAndDrivers')}
                                    </h4>
                                    <p className="ds-caption mb-4" style={{ color: 'var(--text-muted)' }}>
                                        {t('onboarding.binariesDescription')}
                                    </p>

                                    {!isReady && (
                                        <div className="space-y-4">
                                            {downloadError && (
                                                <div role="alert" className="ds-inset rounded-md p-3 flex items-start gap-2">
                                                    <AlertTriangle size={14} className="flex-shrink-0" style={{ color: 'var(--primary)', marginTop: 1 }} />
                                                    <p className="ds-caption" style={{ color: 'var(--text-base)' }}>
                                                        {downloadError}
                                                    </p>
                                                </div>
                                            )}

                                            <button
                                                data-autofocus
                                                onClick={onDownload}
                                                disabled={isDownloading}
                                                className="ds-btn ds-btn-primary"
                                            >
                                                {isDownloading ? (
                                                    <><RefreshCcw size={12} className="animate-spin" /> {t('onboarding.downloadingProgress', { progress: downloadProgress })}</>
                                                ) : (
                                                    <><Download size={14} /> {t('onboarding.downloadCoreBinaries')}</>
                                                )}
                                            </button>

                                            {isDownloading && (
                                                <div className="w-full max-w-sm">
                                                    <div
                                                        role="progressbar"
                                                        aria-label={t('onboarding.downloadCoreBinaries')}
                                                        aria-valuemin={0}
                                                        aria-valuemax={100}
                                                        aria-valuenow={downloadProgress}
                                                        className="ds-inset h-2 overflow-hidden p-0"
                                                    >
                                                        <div className="h-full rounded-full" style={{ width: `${downloadProgress}%`, background: 'var(--primary)' }} />
                                                    </div>
                                                </div>
                                            )}

                                            <div className="pt-6" style={{ borderTop: '1px solid var(--border-base)' }}>
                                                <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--text-muted)' }}>
                                                    <HelpCircle size={14} />
                                                    <span className="ds-label">{t('onboarding.manualSetupFallback')}</span>
                                                </div>
                                                <p className="ds-caption mb-3" style={{ color: 'var(--text-muted)' }}>
                                                    {t('onboarding.manualSetupBefore')} <span className="ds-strong" style={{ color: 'var(--text-base)' }}>{t('onboarding.manualSetupAdministrator')}</span>{t('onboarding.manualSetupAfter')}
                                                </p>
                                                <a
                                                    href="https://github.com/Genymobile/scrcpy/releases/latest"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ds-link"
                                                >
                                                    {t('onboarding.githubReleases')} <ExternalLink size={10} />
                                                </a>
                                            </div>
                                        </div>
                                    )}

                                    {isReady && (
                                        <div className="flex items-center gap-2 ds-fade-in">
                                            <span className="ds-dot" data-live="true" />
                                            <span className="ds-badge" data-live="true">{t('onboarding.successBinariesActive')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 pt-8 flex justify-end items-center" style={{ borderTop: '1px solid var(--border-base)' }}>
                            <button
                                data-autofocus
                                onClick={onComplete}
                                disabled={!isReady}
                                className={isReady ? 'ds-btn ds-btn-primary' : 'ds-btn ds-btn-secondary'}
                            >
                                {t('onboarding.continueToApp')}
                                <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
        </Modal>
    );
}
