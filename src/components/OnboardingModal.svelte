<script lang="ts">
    import { CheckCircle2, Download, Cpu, ArrowRight, X, ExternalLink, HelpCircle, RefreshCcw, AlertTriangle } from '@lucide/svelte';
    import Modal from './Modal.svelte';
    import ProgressBar from './ProgressBar.svelte';
    import { t } from '../i18n';

    interface Props {
        isOpen: boolean;
        onClose: () => void;
        binaryStatus: { found: boolean; message: string };
        onDownload: () => void;
        isDownloading: boolean;
        downloadProgress: number;
        onComplete: () => void;
        downloadError?: string | null;
    }

    let {
        isOpen,
        onClose,
        binaryStatus,
        onDownload,
        isDownloading,
        downloadProgress,
        onComplete,
        downloadError
    }: Props = $props();

    const isReady = $derived(binaryStatus.found);
</script>

<Modal
    {isOpen}
    {onClose}
    label={t('onboarding.setupCoreComponents')}
    zIndex={200}
    closeOnBackdrop={false}
    overlayClassName="p-4"
    panelClassName="w-full max-w-2xl overflow-hidden"
>
    <div class="absolute top-0 right-0 p-6 z-30">
        <button onclick={onClose} aria-label={t('common.cancel')} class="ds-btn ds-btn-tertiary">
            <X size={24} />
        </button>
    </div>

    <div class="flex flex-col md:flex-row h-full">
        <div class="hidden md:flex md:w-1/3 p-8 flex-col justify-between relative overflow-hidden" style="background: var(--bg-input); border-right: 1px solid var(--border-base)">
            <div class="relative z-10">
                <h2 class="ds-body ds-strong">Open<span style="color: var(--primary)">Scrcpy</span></h2>
                <p class="ds-caption mt-2" style="color: var(--primary)">{t('onboarding.coreInitialization')}</p>
            </div>
            <div class="relative z-10">
                <div class="ds-inset p-4">
                    <p class="ds-caption" style="color: var(--text-secondary)">{t('onboarding.introQuote')}</p>
                </div>
            </div>
        </div>

        <div class="flex-1 p-8">
            <div class="mb-10">
                <h3 class="ds-body ds-strong mb-2">{t('onboarding.setupCoreComponents')}</h3>
                <p class="ds-caption" style="color: var(--text-muted)">{t('onboarding.setupCoreSubtitle')}</p>
            </div>

            <div class="space-y-8">
                <div class="flex gap-4">
                    <div class="flex flex-col items-center">
                        <div class="ds-inset w-10 h-10 rounded-md flex items-center justify-center">
                            {#if isReady}
                                <CheckCircle2 size={20} />
                            {:else}
                                <Cpu size={20} />
                            {/if}
                        </div>
                    </div>

                    <div class="flex-1 pt-1">
                        <h4 class="ds-label">{t('onboarding.binariesAndDrivers')}</h4>
                        <p class="ds-caption mb-4" style="color: var(--text-muted)">{t('onboarding.binariesDescription')}</p>

                        {#if !isReady}
                            <div class="space-y-4">
                                {#if downloadError}
                                    <div role="alert" class="ds-inset rounded-md p-3 flex items-start gap-2">
                                        <AlertTriangle size={14} class="flex-shrink-0" style="color: var(--primary); margin-top: 1px" />
                                        <p class="ds-caption" style="color: var(--text-base)">{downloadError}</p>
                                    </div>
                                {/if}

                                <button data-autofocus onclick={onDownload} disabled={isDownloading} class="ds-btn ds-btn-primary">
                                    {#if isDownloading}
                                        <RefreshCcw size={12} class="animate-spin" />
                                        {t('onboarding.downloadingProgress', { progress: downloadProgress })}
                                    {:else}
                                        <Download size={14} />
                                        {t('onboarding.downloadCoreBinaries')}
                                    {/if}
                                </button>

                                {#if isDownloading}
                                    <ProgressBar
                                        value={downloadProgress}
                                        label={t('onboarding.downloadCoreBinaries')}
                                        variant="card"
                                        class="w-full max-w-sm"
                                    />
                                {/if}

                                <div class="pt-6" style="border-top: 1px solid var(--border-base)">
                                    <div class="flex items-center gap-2 mb-2" style="color: var(--text-muted)">
                                        <HelpCircle size={14} />
                                        <span class="ds-label">{t('onboarding.manualSetupFallback')}</span>
                                    </div>
                                    <p class="ds-caption mb-3" style="color: var(--text-muted)">
                                        {t('onboarding.manualSetupBefore')}
                                        <span class="ds-strong" style="color: var(--text-base)">{t('onboarding.manualSetupAdministrator')}</span>
                                        {t('onboarding.manualSetupAfter')}
                                    </p>
                                    <a href="https://github.com/Genymobile/scrcpy/releases/latest" target="_blank" rel="noopener noreferrer" class="ds-link">
                                        {t('onboarding.githubReleases')} <ExternalLink size={10} />
                                    </a>
                                </div>
                            </div>
                        {/if}

                        {#if isReady}
                            <div class="flex items-center gap-2 ds-fade-in">
                                <span class="ds-dot" data-live="true"></span>
                                <span class="ds-badge" data-live="true">{t('onboarding.successBinariesActive')}</span>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>

            <div class="mt-12 pt-8 flex justify-end items-center" style="border-top: 1px solid var(--border-base)">
                <button
                    data-autofocus
                    onclick={onComplete}
                    disabled={!isReady}
                    class={isReady ? 'ds-btn ds-btn-primary' : 'ds-btn ds-btn-secondary'}
                >
                    {t('onboarding.continueToApp')}
                    <ArrowRight size={16} />
                </button>
            </div>
        </div>
    </div>
</Modal>
