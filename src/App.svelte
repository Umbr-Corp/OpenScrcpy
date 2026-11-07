<script lang="ts">
    import { onMount } from 'svelte';
    import { invoke } from '@tauri-apps/api/core';
    import { getCurrentWindow } from '@tauri-apps/api/window';
    import { scrcpy } from './lib/scrcpy.svelte';
    import { isTauri } from './lib/tauri';
    import { showAlert } from './lib/alerts.svelte';
    import { t } from './i18n';
    import Header from './components/Header.svelte';
    import Sidebar from './components/Sidebar.svelte';
    import ControlPanel from './components/ControlPanel.svelte';
    import LogPanel from './components/LogPanel.svelte';
    import SessionBehavior from './components/SessionBehavior.svelte';
    import ShortcutsPanel from './components/ShortcutsPanel.svelte';
    import WindowResizeEdges from './components/WindowResizeEdges.svelte';
    import OnboardingModal from './components/OnboardingModal.svelte';
    import AlertHost from './components/AlertHost.svelte';
    import ErrorBoundary from './components/ErrorBoundary.svelte';

    onMount(() => {
        void scrcpy.init().catch(error => {
            console.error('Failed to initialize scrcpy store', error);
        });
        return () => scrcpy.destroy();
    });

    $effect(() => {
        if (scrcpy.ready) scrcpy.persistConfig();
    });

    $effect(() => {
        if (scrcpy.ready) scrcpy.persistWindowPositions();
    });

    $effect(() => {
        if (!scrcpy.ready || !isTauri()) return;
        const device =
            scrcpy.activeDevice && scrcpy.runningDevices.includes(scrcpy.activeDevice)
                ? scrcpy.activeDevice
                : null;
        void invoke('set_active_device', { device }).catch(() => {});
    });

    onMount(() => {
        if (!isTauri()) return;
        const unlisten = getCurrentWindow().listen<{ paths: string[] }>('tauri://drag-drop', event => {
            if (!scrcpy.activeDevice) {
                scrcpy.addLogs(t('logs.noDeviceForDragDrop'), 'warn');
                return;
            }
            for (const path of event.payload.paths ?? []) {
                void scrcpy.handleFileOperation(path);
            }
        });
        return () => {
            unlisten.then(fn => fn()).catch(() => {});
        };
    });

    function handleListOptions(arg: string) {
        if (scrcpy.activeDevice) {
            void scrcpy.listScrcpyOptions(scrcpy.activeDevice, arg);
        } else {
            showAlert({
                title: t('alerts.noDeviceSelectedTitle'),
                message: t('alerts.noDeviceForListOptions'),
                kind: 'warning'
            });
        }
    }
</script>

<ErrorBoundary>
    <div
        class="min-h-screen font-sans flex flex-col"
        style="background-color: var(--bg-base); color: var(--text-base)"
    >
        <div class="flex flex-col h-screen">
            <Header
                colorMode={scrcpy.colorMode}
                onColorModeChange={scrcpy.setColorMode}
                binaryStatus={scrcpy.scrcpyStatus}
                onDownload={scrcpy.downloadScrcpy}
                onSetPath={scrcpy.handleSetPath}
                onResetPath={scrcpy.handleResetPath}
                isDownloading={scrcpy.isDownloading}
                downloadProgress={scrcpy.downloadProgress}
                version={scrcpy.appVersion}
                appUpdateLatest={scrcpy.appUpdate?.latest ?? null}
                onOpenAppUpdate={() => scrcpy.appUpdate && scrcpy.openAppUpdateModal(scrcpy.appUpdate)}
                onCheckAppUpdate={() => void scrcpy.checkForAppUpdate(false)}
            />
            <WindowResizeEdges />

            <div class="flex-1 overflow-y-auto flex flex-col pt-3">
                <div class="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 px-6 pb-3">
                    <div class="lg:col-span-3 flex flex-col">
                        <Sidebar />
                    </div>

                    <div class="lg:col-span-6 flex flex-col gap-6">
                        <ControlPanel
                            config={scrcpy.config}
                            setConfig={scrcpy.setConfig}
                            onStart={scrcpy.startSession}
                            onStop={scrcpy.stopSession}
                            isRunning={scrcpy.sessionRunning}
                            isStarting={scrcpy.isStarting}
                            detectedCameras={scrcpy.detectedCameras}
                            renderDriverSupport={scrcpy.renderDriverSupport}
                            onListOptions={handleListOptions}
                        />
                        <LogPanel />
                    </div>

                    <div class="lg:col-span-3 flex flex-col gap-6">
                        <SessionBehavior />
                        <ShortcutsPanel />
                    </div>
                </div>
            </div>
        </div>

        <OnboardingModal
            isOpen={scrcpy.isOnboardingOpen}
            onClose={() => (scrcpy.isOnboardingOpen = false)}
            binaryStatus={scrcpy.scrcpyStatus}
            onDownload={scrcpy.downloadScrcpy}
            isDownloading={scrcpy.isDownloading}
            downloadProgress={scrcpy.downloadProgress}
            downloadError={scrcpy.downloadError}
            onComplete={scrcpy.completeOnboarding}
        />

        <AlertHost />
    </div>
</ErrorBoundary>
