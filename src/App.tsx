import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import Sidebar from "./components/Sidebar";
import ControlPanel from "./components/ControlPanel";
import LogPanel from "./components/LogPanel";
import Header from "./components/Header";
import { WindowResizeEdges } from "./components/WindowChrome";
import SessionBehavior from "./components/SessionBehavior";
import ShortcutsPanel from "./components/ShortcutsPanel";
import ErrorBoundary from "./components/ErrorBoundary";
import OnboardingModal from "./components/OnboardingModal";
import ThemedModal from "./components/ThemedModal";
import { useScrcpy } from "./hooks/useScrcpy";
import { isTauri } from "./tauri";
import { appendLogs } from './logs';
import { getVersion } from '@tauri-apps/api/app';
import { useI18n } from "./i18n";

function App() {
  const { t } = useI18n();
  const {
    devices,
    deviceModels,
    deviceFriendlyNames,
    logs,
    activeDevice,
    setActiveDevice,
    refreshDevices,
    refreshDevicesUntilSettled,
    runScrcpy,
    stopScrcpy,
    downloadScrcpy,
    checkScrcpy,
    scrcpyStatus,
    setLogs,
    isDownloading,
    downloadProgress,
    pairDevice,
    connectDevice,
    listScrcpyOptions,
    runTerminalCommand,
    runningDevices,
    isRefreshing,
    sessionRunning,
    clearLogs,
    detectedCameras,
    renderDriverSupport,
    mdnsDevices,
    config,
    setConfig,
    colorMode,
    setColorMode,
    pushFile,
    installApk,
    historyDevices,
    clearHistory,
    isOnboardingOpen,
    setIsOnboardingOpen,
    completeOnboarding
  } = useScrcpy();

  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    kind: 'warning' | 'error' | 'info' | 'success';
    actionLabel?: string;
    onAction?: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
    showCancel?: boolean;
    cancelLabel?: string;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    kind: 'info'
  });

  const [appVersion, setAppVersion] = useState("1.0.0");
  const [lastCheckedPath, setLastCheckedPath] = useState<string | undefined>(undefined);
  const [hasCheckedUpdate, setHasCheckedUpdate] = useState(false);
  // Self-update notice: filled when the app's own GitHub release is newer
  // than the running build (checked once, silently, on startup).
  const [appUpdateInfo, setAppUpdateInfo] = useState<{
    latest: string;
    current: string;
    notes: string;
  } | null>(null);
  // Device being switched from USB to wireless (drives the card button state).
  const [wirelessSwitching, setWirelessSwitching] = useState<string | null>(null);

  // Alerts moved from 10 positional parameters to an options object: one
  // call site used to pass `undefined` mid-list just to reach a later
  // argument. ThemedModal keeps its props unchanged.
  interface AlertOptions {
    title: string;
    message: string;
    kind?: 'warning' | 'error' | 'info' | 'success';
    actionLabel?: string;
    onAction?: () => void;
    showCancel?: boolean;
    cancelLabel?: string;
    onCancel?: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
  }

  const showAlert = (opts: AlertOptions) => {
    setAlertState({
      isOpen: true,
      ...opts,
      kind: opts.kind ?? 'info',
      actionLabel: opts.actionLabel ?? t('common.ok'),
      cancelLabel: opts.cancelLabel ?? t('common.cancel')
    });
  };

  useEffect(() => {
    // Initial setup: fetch version (no artificial delay -- getVersion works
    // immediately in the Tauri WebView, and silently no-ops in preview mode).
    const initApp = async () => {
      try {
        const v = await getVersion();
        setAppVersion(v);
      } catch (e) {
        console.error("Initialization failed:", e);
      }
    };

    initApp();
  }, []);

  useEffect(() => {
    // Initial check (once on mount) - Silent to avoid log clatter. adb's own
    // reconnect of an already-paired device can lag a beat behind the app
    // opening, so keep checking briefly instead of a single refresh that
    // might land before adb has caught up.
    checkScrcpy(config.scrcpyPath);
    refreshDevicesUntilSettled(config.scrcpyPath);
  }, []);

  useEffect(() => {
    if (scrcpyStatus.found && (!hasCheckedUpdate || config.scrcpyPath !== lastCheckedPath) && !isDownloading) {
      setHasCheckedUpdate(true);
      setLastCheckedPath(config.scrcpyPath);
      
      const runCheck = async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const updateRes: any = await invoke('check_scrcpy_update', { customPath: config.scrcpyPath });
          if (updateRes && updateRes.update_available) {
            showAlert({
              title: t('alerts.updateAvailableTitle'),
              message: t('alerts.updateAvailableMessage', {
                local: updateRes.local_version || 'unknown',
                latest: updateRes.latest_version || 'unknown'
              }),
              kind: 'info',
              actionLabel: t('alerts.updateBtn'),
              onAction: async () => {
                if (config.scrcpyPath) {
                  setConfig(prev => ({ ...prev, scrcpyPath: undefined }));
                }
                await downloadScrcpy();
              },
              showCancel: true,
              cancelLabel: t('alerts.cancelBtn')
            });
          }
        } catch (e) {
          console.error("Failed to check for scrcpy updates:", e);
        }
      };
      runCheck();
    } else if (!scrcpyStatus.found) {
      setHasCheckedUpdate(false);
    }
  }, [scrcpyStatus.found, config.scrcpyPath, isDownloading, hasCheckedUpdate, lastCheckedPath, t]);

  // ── App self-update (GitHub releases) ────────────────────────────────
  // Opens "releases/latest" in the user's browser; the download itself
  // stays out of the app on purpose (Route 1, no updater plugin yet).
  // In-app install path (validator-checked): the updater plugin downloads
  // the signed artifact announced by latest.json and installs it; a manual
  // "See on GitHub" secondary path stays for when the plugin path fails.
  const handleAutoUpdate = async () => {
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      const update = await check();
      if (!update) {
        showAlert({ title: t('alerts.appUpToDateTitle'), message: t('alerts.appUpToDateMsg', { v: appVersion }), kind: 'info' });
        return;
      }
      let total = 0;
      let done = 0;
      // Progress fires per chunk; without a gate each chunk re-renders the
      // whole app through showAlert (a new alert object every call). Showing
      // only on integer-percent change caps it at ~101 renders per download.
      let lastShownPct = -1;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          done += event.data.chunkLength;
          if (total > 0) {
            const p = Math.min(100, Math.round((done / total) * 100));
            if (p !== lastShownPct) {
              lastShownPct = p;
              showAlert({ title: t('about.autoDownloading'), message: t('about.autoProgress', { p }), kind: 'info' });
            }
          }
        }
      });
      showAlert({ title: t('about.autoInstalled'), message: t('about.autoRestarting'), kind: 'success' });
      await relaunch();
    } catch (e) {
      showAlert({
        title: t('about.autoFailTitle'),
        message: `${t('about.autoFailMsg')}\n\n${t('alerts.wirelessConsoleLabel')}: ${String(e)}`,
        kind: 'warning'
      });
    }
  };

  const openAppUpdateModal = (info: { latest: string; notes: string }) => {
    // Release bodies are markdown; strip the obvious markup so the plain
    // modal text stays readable.
    const notes = (info.notes || '')
      .replace(/^#{1,4}\s?/gm, '')
      .replace(/^>\s?/gm, '')
      .replace(/[*`]/g, '')
      .trim();
    showAlert({
      title: t('alerts.newAppVersionTitle', { v: info.latest }),
      message: notes || t('alerts.newAppVersionMsg'),
      kind: 'info',
      actionLabel: t('about.autoUpdateBtn'),
      onAction: handleAutoUpdate,
      showCancel: true,
      cancelLabel: t('alerts.appCloseBtn'),
      secondaryLabel: t('alerts.updateOpenBtn'),
      onSecondary: async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('open_app_release');
        } catch {
          window.open('https://github.com/Umbr-Corp/OpenScrcpy/releases/latest', '_blank');
        }
      }
    });
  };

  const checkAppUpdate = async (silent: boolean) => {
    if (!isTauri()) return null;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke<{ update_available: boolean; current: string; latest: string; notes: string }>('check_app_update');
      if (res.update_available) setAppUpdateInfo(res);
      if (!silent) {
        if (res.update_available) openAppUpdateModal(res);
        else showAlert({ title: t('alerts.appUpToDateTitle'), message: t('alerts.appUpToDateMsg', { v: res.current }), kind: 'info' });
      }
      return res;
    } catch {
      if (!silent) showAlert({ title: t('alerts.appCheckFailedTitle'), message: t('alerts.appCheckFailedMsg'), kind: 'warning' });
      return null;
    }
  };

  useEffect(() => {
    checkAppUpdate(true).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // USB -> wireless in one click: the backend reads the phone's Wi-Fi IP,
  // flips adbd into TCPIP and reconnects; here we surface the outcome and
  // let the device poll fold the :5555 transport into the same hub card.
  // Failure messages carry a short why + the console excerpt. The three
  // known failure shapes map to plain-language guidance:
  // - adbd waiting for the USB-debugging prompt on the phone
  // - unreachable/different host (DHCP moved or another gadget answered)
  // - anything else → point at the console for the exact step.
  const diagnoseWirelessFailure = (msg: string): string => {
    const m = msg || '';
    if (/authenticate|unauthorized/i.test(m)) return t('alerts.wirelessHintAuth');
    if (/timed ?out|cannot connect|not connected|failed to connect/i.test(m)) return t('alerts.wirelessHintConn');
    return t('alerts.wirelessHintGeneric');
  };

  const handleGotoWireless = async (device: string) => {
    if (wirelessSwitching) return;
    setWirelessSwitching(device);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke<{ success: boolean; message: string; ip?: string }>('goto_wireless', { device });
      if (res.success) {
        showAlert({ title: t('alerts.wirelessOkTitle'), message: t('alerts.wirelessOkMsg', { ip: res.ip ?? '' }), kind: 'success' });
      } else {
        const detail = (res.message || '').trim();
        const hint = diagnoseWirelessFailure(detail);
        showAlert({
          title: t('alerts.wirelessFailTitle'),
          message: detail ? `${hint}\n\n${t('alerts.wirelessConsoleLabel')}: ${detail}` : hint,
          kind: 'warning'
        });
      }
    } catch (e) {
      const detail = String(e).trim();
      showAlert({
        title: t('alerts.wirelessFailTitle'),
        message: detail ? `${diagnoseWirelessFailure(detail)}\n\n${t('alerts.wirelessConsoleLabel')}: ${detail}` : t('alerts.wirelessHintGeneric'),
        kind: 'warning'
      });
    } finally {
      setWirelessSwitching(null);
      refreshDevices().catch(() => { });
    }
  };

  useEffect(() => {
    // No-op outside the Tauri WebView (plain browser preview): there is
    // no window API nor file-drop event source there.
    if (!isTauri()) return;
    // Global Drag and Drop Listener (re-bind only if activeDevice changes)
    const unlisten = getCurrentWindow().listen<{ paths: string[] }>("tauri://drag-drop", (event) => {
      if (!activeDevice) {
        setLogs(prev => appendLogs(prev, t('logs.noDeviceForDragDrop'), 'warn'));
        return;
      }

      const paths = event.payload.paths;
      if (paths && paths.length > 0) {
        paths.forEach(path => handleFileOperation(path));
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [activeDevice]);

  useEffect(() => {
    // Keep the Rust side's notion of "the selected device" in sync, so the
    // Ctrl+Alt+Shift+C global shortcut (a real OS-level hotkey registered in
    // shortcuts.rs, not a webview keydown listener) knows which mirror window
    // to recentre even when no app window has keyboard focus.
    const device = activeDevice && runningDevices.includes(activeDevice) ? activeDevice : null;
    if (!isTauri()) return;
    (async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_active_device', { device });
    })().catch(() => { /* preview mode: no backend */ });
  }, [activeDevice, runningDevices]);

  useEffect(() => {
    if (activeDevice) {
      setConfig(prev => ({ ...prev, device: activeDevice }));
    }
  }, [activeDevice]);

  // Session mode each device was started with, so a re-start on the same
  // device can detect a tab switch (mirror/camera/desktop/mic share the
  // session slot: the backend pre-kills the device's registered session,
  // which used to be invisible to the user).
  const startedModeByDeviceRef = useRef<Record<string, string>>({});
  const sessionModeLabelKey: Record<string, string> = {
    mirror: 'controlPanel.screen',
    camera: 'controlPanel.camera',
    desktop: 'controlPanel.desktop',
    mic: 'controlPanel.microphone'
  };

  const performStart = async () => {
    if (activeDevice) {
      startedModeByDeviceRef.current[activeDevice] = config.sessionMode;
    }
    await runScrcpy(config);
  };

  const handleStart = async () => {
    if (!activeDevice) {
      showAlert({ title: t('alerts.noDeviceSelectedTitle'), message: t('alerts.noDeviceSelectedMessage'), kind: 'warning' });
      return;
    }
    // Only when THIS device has a live session running a different mode;
    // sessions on other devices are never touched by the backend.
    const runningMode = runningDevices.includes(activeDevice)
      ? startedModeByDeviceRef.current[activeDevice]
      : undefined;
    if (runningMode && runningMode !== config.sessionMode) {
      showAlert({
        title: t('alerts.sessionReplaceTitle'),
        message: t('alerts.sessionReplaceMsg', {
          mode: t(sessionModeLabelKey[runningMode] ?? runningMode),
          newMode: t(sessionModeLabelKey[config.sessionMode] ?? config.sessionMode)
        }),
        kind: 'warning',
        actionLabel: t('alerts.sessionReplaceConfirm'),
        onAction: performStart,
        showCancel: true
      });
      return;
    }
    await performStart();
  };

  const handleStop = async () => {
    if (!activeDevice) return;
    delete startedModeByDeviceRef.current[activeDevice];
    await stopScrcpy(activeDevice);
  };

  const handleRefresh = () => {
    refreshDevices();
  };

  const handleKillAdb = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('kill_adb', { customPath: config.scrcpyPath });
      refreshDevices(config.scrcpyPath);
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileOperation = async (path: string) => {
    if (!activeDevice) return;

    const isApk = path.toLowerCase().endsWith('.apk');
    if (isApk) {
      await installApk(activeDevice, path);
    } else {
      await pushFile(activeDevice, path);
    }
  };

  const handleFileBrowse = async () => {
    if (!activeDevice) return;
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'All Files',
            extensions: ['*']
          },
          {
            name: 'Android App (APK)',
            extensions: ['apk']
          }
        ]
      });

      if (selected) {
        if (Array.isArray(selected)) {
          selected.forEach(path => handleFileOperation(path));
        } else {
          handleFileOperation(selected);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSetPath = async () => {
    try {
      let startPath = config.scrcpyPath;
      if (!startPath) {
        const { invoke } = await import('@tauri-apps/api/core');
        startPath = await invoke<string>('get_scrcpy_bin_dir').catch(() => '');
      }
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: startPath || undefined
      });
      if (selected && typeof selected === 'string') {
        setConfig(prev => ({ ...prev, scrcpyPath: selected }));
        setLogs(prev => appendLogs(prev, t('logs.customScrcpyPathSet', { path: selected }), 'system'));
        // Trigger a check with the new path
        setTimeout(() => checkScrcpy(selected), 100);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetPath = async () => {
    setConfig(prev => ({ ...prev, scrcpyPath: undefined }));
    setLogs(prev => appendLogs(prev, t('logs.customScrcpyPathCleared'), 'system'));
    // Trigger a check with no custom path
    setTimeout(() => checkScrcpy(undefined), 100);
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen font-sans flex flex-col" style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-base)' }}>
        <div className="flex flex-col h-screen">
          <Header
            colorMode={colorMode}
            onColorModeChange={setColorMode}
            binaryStatus={scrcpyStatus}
            onDownload={downloadScrcpy}
            onSetPath={handleSetPath}
            onResetPath={handleResetPath}
            isDownloading={isDownloading}
            downloadProgress={downloadProgress}
            version={appVersion}
            appUpdateLatest={appUpdateInfo?.latest ?? null}
            onOpenAppUpdate={() => appUpdateInfo && openAppUpdateModal(appUpdateInfo)}
            onCheckAppUpdate={() => void checkAppUpdate(false)}
          />
          <WindowResizeEdges />

          <div className="flex-1 overflow-y-auto flex flex-col pt-3">
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 px-6 pb-3">
              <div className="lg:col-span-3 flex flex-col">
                <Sidebar
                  devices={devices}
                  deviceModels={deviceModels}
                  deviceFriendlyNames={deviceFriendlyNames}
                  runningDevices={runningDevices}
                  onRefresh={handleRefresh}
                  onKillAdb={handleKillAdb}
                  selectedDevice={activeDevice}
                  onSelectDevice={setActiveDevice}
                  onPair={pairDevice}
                  onConnect={connectDevice}
                  isRefreshing={isRefreshing}
                  onFilePush={handleFileBrowse}
                  historyDevices={historyDevices}
                  clearHistory={clearHistory}
                  mdnsDevices={mdnsDevices}
                  onGotoWireless={handleGotoWireless}
                  wirelessSwitching={wirelessSwitching}
                />
              </div>

              <div className="lg:col-span-6 flex flex-col gap-6">
                <ControlPanel
                  config={config}
                  setConfig={setConfig}
                  onStart={handleStart}
                  onStop={handleStop}
                  isRunning={sessionRunning}
                  detectedCameras={detectedCameras}
                  renderDriverSupport={renderDriverSupport}
                  onListOptions={(arg) => {
                    if (activeDevice) {
                      listScrcpyOptions(activeDevice, arg);
                    } else {
                      showAlert({
                        title: t('alerts.noDeviceSelectedTitle'),
                        message: t('alerts.noDeviceForListOptions'),
                        kind: 'warning'
                      });
                    }
                  }}
                />
                <LogPanel
                  logs={logs}
                  onClear={clearLogs}
                  onAddLog={(msg) => setLogs(prev => appendLogs(prev, msg))}
                  onRunCommand={runTerminalCommand}
                />
              </div>

              <div className="lg:col-span-3 flex flex-col gap-6">
                <SessionBehavior config={config} setConfig={setConfig} />
                <ShortcutsPanel />
              </div>
            </div>
          </div>
        </div>

        <OnboardingModal
          isOpen={isOnboardingOpen}
          onClose={() => setIsOnboardingOpen(false)}
          binaryStatus={scrcpyStatus}
          onDownload={downloadScrcpy}
          isDownloading={isDownloading}
          downloadProgress={downloadProgress}
          onComplete={completeOnboarding}
        />

        <ThemedModal
          isOpen={alertState.isOpen}
          onClose={() => setAlertState(prev => ({ ...prev, isOpen: false }))}
          title={alertState.title}
          message={alertState.message}
          kind={alertState.kind}
          actionLabel={alertState.actionLabel}
          onAction={alertState.onAction}
          secondaryLabel={alertState.secondaryLabel}
          onSecondary={alertState.onSecondary}
          showCancel={alertState.showCancel}
          cancelLabel={alertState.cancelLabel}
          onCancel={alertState.onCancel}
        />
      </div>
    </ErrorBoundary>
  );
}

export default App;
