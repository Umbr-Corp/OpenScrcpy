<script lang="ts">
    import { Download, FolderOpen, RefreshCcw, HelpCircle, Info, Heart, ExternalLink, Languages, ChevronDown, Sun, Moon, Monitor, Cpu, ArrowUp } from '@lucide/svelte';
    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { SUPPORTED_LOCALES, i18n, setLocale, t } from '../i18n';
    import { isTauri } from '../lib/tauri';
    import SheetModal from './SheetModal.svelte';
    import ProgressBar from './ProgressBar.svelte';
    import WindowButtons from './WindowButtons.svelte';
    import { WINDOW_DRAG_EXCLUDE } from './windowChrome';

    interface Props {
        colorMode: 'light' | 'dark' | 'system';
        onColorModeChange: (mode: 'light' | 'dark' | 'system') => void;
        binaryStatus: { found: boolean; message: string };
        onDownload: () => void;
        onSetPath: () => void;
        onResetPath: () => void;
        isDownloading: boolean;
        downloadProgress: number;
        version: string;
        appUpdateLatest?: string | null;
        onOpenAppUpdate?: () => void;
        onCheckAppUpdate?: () => void;
    }

    let {
        colorMode,
        onColorModeChange,
        binaryStatus,
        onDownload,
        onSetPath,
        onResetPath,
        isDownloading,
        downloadProgress,
        version,
        appUpdateLatest,
        onOpenAppUpdate,
        onCheckAppUpdate
    }: Props = $props();

    let showHelp = $state(false);
    let showAbout = $state(false);
    let showLangMenu = $state(false);
    let showEngineMenu = $state(false);
    let langMenuRef: HTMLDivElement;
    let engineMenuRef: HTMLDivElement;
    let langButtonRef: HTMLButtonElement;
    let engineButtonRef: HTMLButtonElement;
    let langOptions: HTMLButtonElement[] = [];
    let focusLangOnOpen = false;

    $effect(() => {
        if (!showLangMenu && !showEngineMenu) return;
        const onClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (langMenuRef && !langMenuRef.contains(target)) showLangMenu = false;
            if (engineMenuRef && !engineMenuRef.contains(target)) showEngineMenu = false;
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    });

    $effect(() => {
        if (!showLangMenu || !focusLangOnOpen) return;
        focusLangOnOpen = false;
        const selected = langOptions[SUPPORTED_LOCALES.indexOf(i18n.locale)] ?? langOptions[0];
        selected?.focus();
    });

    function onLangKeyDown(e: KeyboardEvent) {
        if (!showLangMenu) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                focusLangOnOpen = true;
                showLangMenu = true;
            }
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            showLangMenu = false;
            langButtonRef?.focus();
            return;
        }
        if (e.key === 'Tab') {
            showLangMenu = false;
            return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        const options = langOptions.filter(Boolean);
        if (!options.length) return;
        e.preventDefault();
        const current = options.indexOf(document.activeElement as HTMLButtonElement);
        let next: number;
        if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = options.length - 1;
        else if (e.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % options.length;
        else next = current < 0 ? options.length - 1 : (current - 1 + options.length) % options.length;
        options[next].focus();
    }

    function onEngineKeyDown(e: KeyboardEvent) {
        if (e.key !== 'Escape' || !showEngineMenu) return;
        e.preventDefault();
        e.stopPropagation();
        showEngineMenu = false;
        engineButtonRef?.focus();
    }

    const engineText = $derived(
        isDownloading
            ? t('header.syncingComponents', { progress: downloadProgress })
            : binaryStatus.found
              ? t('header.scrcpyReady')
              : binaryStatus.message
    );

    function onHeaderMouseDown(e: MouseEvent) {
        if (!isTauri() || e.button !== 0) return;
        if ((e.target as HTMLElement).closest(WINDOW_DRAG_EXCLUDE)) return;
        e.preventDefault();
        getCurrentWindow().startDragging().catch(() => {});
    }

    function onHeaderDoubleClick(e: MouseEvent) {
        if (!isTauri()) return;
        if ((e.target as HTMLElement).closest(WINDOW_DRAG_EXCLUDE)) return;
        getCurrentWindow().toggleMaximize().catch(() => {});
    }

    const colorModes = [
        { id: 'light' as const, Icon: Sun, label: 'header.colorModes.light' },
        { id: 'dark' as const, Icon: Moon, label: 'header.colorModes.dark' },
        { id: 'system' as const, Icon: Monitor, label: 'header.colorModes.system' }
    ];
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_static_element_interactions -->
<header
    class="flex items-center gap-3 px-4 py-2 flex-nowrap"
    style="background-color: var(--bg-surface); border-bottom: 1px solid var(--border-base)"
    onmousedown={onHeaderMouseDown}
    ondblclick={onHeaderDoubleClick}
>
    <SheetModal
        isOpen={showHelp}
        onClose={() => (showHelp = false)}
        closeOnBackdrop={false}
        zIndex={100}
        title={t('header.manualSetupGuide')}
        icon={HelpCircle}
        backdropStyle="background-color: color-mix(in srgb, var(--text-base) 40%, transparent)"
        overlayClassName="p-4"
        panelClassName="rounded-lg max-w-md w-full p-6"
    >
        {#snippet footer()}
            <button data-autofocus onclick={() => (showHelp = false)} class="ds-btn ds-btn-primary w-full">
                {t('header.gotIt')}
            </button>
        {/snippet}
        <div class="space-y-4 ds-body" style="color: var(--text-secondary)">
            <p>{t('header.manualSetupIntro')}</p>
            <ol class="list-decimal list-inside space-y-3">
                <li>
                    {t('header.manualStep1')}
                    <a
                        href="https://github.com/Genymobile/scrcpy/releases/latest"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="ds-link flex items-center gap-1 mt-1 ml-4"
                    >
                        {t('header.manualStep1Link')} <ExternalLink size={10} />
                    </a>
                </li>
                <li>{t('header.manualStep2')}</li>
                <li>
                    {t('header.manualStep3Before')}
                    <span class="ds-inset rounded-sm inline-flex items-center gap-1 px-1.5 py-0.5 mx-1">
                        <FolderOpen size={10} /> {t('header.manualStep3Browse')}
                    </span>
                    {t('header.manualStep3After')}
                </li>
                <li>
                    {t('header.manualStep4Before')}
                    <code class="ds-strong" style="color: var(--primary)">{t('header.manualStep4Executable')}</code>
                    {t('header.manualStep4After')}
                </li>
            </ol>
            <div class="pt-3" style="border-top: 1px solid var(--border-base)">
                <p class="ds-caption" style="color: var(--text-muted)">{t('header.manualNote')}</p>
            </div>
        </div>
    </SheetModal>

    <SheetModal
        isOpen={showAbout}
        onClose={() => (showAbout = false)}
        closeOnBackdrop={false}
        zIndex={100}
        title={t('header.aboutTitle')}
        icon={Info}
        backdropStyle="background-color: color-mix(in srgb, var(--text-base) 40%, transparent)"
        overlayClassName="p-4"
        panelClassName="rounded-lg max-w-md w-full p-6"
    >
        {#snippet footer()}
            <button data-autofocus onclick={() => (showAbout = false)} class="ds-btn ds-btn-primary w-full">
                {t('header.gotIt')}
            </button>
        {/snippet}
        <div class="flex flex-col items-center text-center gap-3">
            <div class="flex items-center gap-2">
                <span class="ds-body ds-strong" style="font-size: 20px; color: var(--text-base)">OpenScrcpy</span>
                <span class="ds-badge">V{version}</span>
            </div>
            <p class="ds-body" style="color: var(--text-secondary)">{t('header.aboutDescription')}</p>
            <div class="flex gap-2 w-full">
                <a
                    href="https://v16.next.forgejo.org/UmbrCorp/OpenScrcpy"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ds-btn ds-btn-secondary flex-1"
                >
                    {t('header.aboutRepository')} <ExternalLink size={12} />
                </a>
                <a
                    href="https://v16.next.forgejo.org/UmbrCorp/OpenScrcpy/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ds-btn ds-btn-secondary flex-1"
                >
                    {t('header.aboutReleases')} <ExternalLink size={12} />
                </a>
                <a
                    href="https://liberapay.com/mryofc/donate"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="ds-btn ds-btn-secondary flex-1"
                >
                    <Heart size={12} /> {t('header.aboutDonate')}
                </a>
            </div>
            {#if onCheckAppUpdate}
                <button onclick={onCheckAppUpdate} class="ds-btn ds-btn-tertiary w-full">
                    <RefreshCcw size={12} /> {t('header.checkAppUpdate')}
                </button>
            {/if}
            <p class="ds-caption" style="color: var(--text-muted)">{t('header.aboutLicense')}</p>
        </div>
    </SheetModal>

    <div class="flex items-center gap-2 flex-shrink-0">
        <h1 class="ds-body ds-strong" style="font-size: 17px; line-height: 20px; color: var(--text-base)">OpenScrcpy</h1>
        <span class="ds-badge">V{version}</span>
        {#if appUpdateLatest}
            <button
                onclick={onOpenAppUpdate}
                title={t('header.updateBadge', { v: appUpdateLatest })}
                aria-label={t('header.updateBadge', { v: appUpdateLatest })}
                class="ds-badge cursor-pointer flex items-center gap-1"
                style="color: #E0C559; border-color: #E0C559"
            >
                <ArrowUp size={9} />
                {t('header.updateBadge', { v: appUpdateLatest })}
            </button>
        {/if}
    </div>

    <div class="flex-1"></div>

    <div class="ds-tabs flex-shrink-0" role="tablist" aria-label={t('header.colorModes.system')}>
        {#each colorModes as mode (mode.id)}
            {@const Icon = mode.Icon}
            <button
                role="tab"
                aria-selected={colorMode === mode.id}
                onclick={() => onColorModeChange(mode.id)}
                title={t(mode.label)}
                aria-label={t(mode.label)}
                data-active={colorMode === mode.id}
                class="ds-tab"
            >
                <Icon size={14} />
            </button>
        {/each}
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="relative flex-shrink-0" role="group" bind:this={langMenuRef} onkeydown={onLangKeyDown}>
        <button
            bind:this={langButtonRef}
            onclick={() => (showLangMenu = !showLangMenu)}
            aria-expanded={showLangMenu}
            aria-haspopup="listbox"
            aria-controls={showLangMenu ? 'lang-menu' : undefined}
            aria-label="{t('header.languageLabel')}: {i18n.locale}"
            class="ds-select-btn flex items-center gap-1.5"
            title={t('header.languageLabel')}
        >
            <Languages size={14} />
            <span class="ds-label">{i18n.locale}</span>
            <ChevronDown size={12} style="transform: {showLangMenu ? 'rotate(180deg)' : 'none'}" />
        </button>
        {#if showLangMenu}
            <div
                id="lang-menu"
                role="listbox"
                class="ds-card rounded-md absolute top-full right-0 mt-1 min-w-[160px] z-[120] py-1 ds-fade-in"
            >
                {#each SUPPORTED_LOCALES as loc, index (loc)}
                    <button
                        bind:this={langOptions[index]}
                        role="option"
                        aria-selected={loc === i18n.locale}
                        onclick={async () => {
                            await setLocale(loc);
                            showLangMenu = false;
                            langButtonRef?.focus();
                        }}
                        data-active={loc === i18n.locale}
                        class="ds-tab w-full justify-start rounded-sm"
                    >
                        {i18n.translations.languages[loc]}
                    </button>
                {/each}
            </div>
        {/if}
    </div>

    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="relative flex-shrink-0" role="group" bind:this={engineMenuRef} onkeydown={onEngineKeyDown}>
        <button
            bind:this={engineButtonRef}
            onclick={() => (showEngineMenu = !showEngineMenu)}
            aria-expanded={showEngineMenu}
            aria-haspopup="dialog"
            aria-controls={showEngineMenu ? 'engine-menu' : undefined}
            class="ds-btn ds-btn-tertiary"
            style="position: relative"
            title="{t('header.scrcpyEngine')}: {engineText}"
            aria-label="{t('header.scrcpyEngine')}: {engineText}"
        >
            <Cpu size={14} />
            <span
                class="ds-dot"
                data-live={binaryStatus.found}
                aria-hidden="true"
                style="position: absolute; top: 2px; right: 2px"
            ></span>
        </button>
        {#if showEngineMenu}
            <div
                id="engine-menu"
                role="dialog"
                aria-label={t('header.scrcpyEngine')}
                class="ds-card rounded-md absolute top-full right-0 mt-1 z-[120] p-3 ds-fade-in"
                style="width: 240px"
            >
                <div class="flex items-center gap-2 mb-1">
                    <span class="ds-dot" data-live={binaryStatus.found} aria-hidden="true"></span>
                    <span class="ds-caption" style="color: var(--text-muted)">{t('header.scrcpyEngine')}</span>
                </div>
                <p class="ds-label ds-strong truncate mb-2" style="color: var(--text-base)">{engineText}</p>
                {#if isDownloading}
                    <ProgressBar
                        value={downloadProgress}
                        label={t('header.scrcpyEngine')}
                        variant="compact"
                        class="w-full mb-2"
                    />
                {/if}
                {#if !binaryStatus.found && !isDownloading}
                    <button onclick={onDownload} class="ds-btn ds-btn-primary w-full mb-2" disabled={isDownloading}>
                        <Download size={14} /> {t('header.installCore')}
                    </button>
                {/if}
                <div class="flex gap-1 pt-2" style="border-top: 1px solid var(--border-base)">
                    <button onclick={onSetPath} class="ds-btn ds-btn-tertiary flex-1" title={t('header.selectFolder')} aria-label={t('header.selectFolder')}>
                        <FolderOpen size={14} />
                    </button>
                    <button onclick={onResetPath} class="ds-btn ds-btn-tertiary flex-1" title={t('header.resetPath')} aria-label={t('header.resetPath')}>
                        <RefreshCcw size={14} />
                    </button>
                    <button
                        onclick={() => {
                            showEngineMenu = false;
                            engineButtonRef?.focus();
                            showHelp = true;
                        }}
                        class="ds-btn ds-btn-tertiary flex-1"
                        title={t('header.setupHelpTitle')}
                        aria-label={t('header.setupHelpTitle')}
                    >
                        <HelpCircle size={14} />
                    </button>
                    <button
                        onclick={() => {
                            showEngineMenu = false;
                            engineButtonRef?.focus();
                            showAbout = true;
                        }}
                        class="ds-btn ds-btn-tertiary flex-1"
                        title={t('header.aboutTitle')}
                        aria-label={t('header.aboutTitle')}
                    >
                        <Info size={14} />
                    </button>
                </div>
            </div>
        {/if}
    </div>

    {#if isTauri()}<WindowButtons />{/if}
</header>
