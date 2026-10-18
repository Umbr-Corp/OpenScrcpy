import { useEffect, useState } from "react";
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
  /** Live mic bridge level (dB) from the backend meter; null when idle. */
  const [micLevel, setMicLevel] = useState<number | null>(null);
  /** Current mic bridge destination: sink description + whether it is our
   *  virtual microphone. */
  const [micRoute, setMicRoute] = useState<{ sink: string; ok: boolean } | null>(null);

  const showAlert = (
    title: string,
    message: string,
    kind: 'warning' | 'error' | 'info' | 'success' = 'info',
    actionLabel = t('common.ok'),
    onAction?: () => void,
    showCancel = false,
    cancelLabel = t('common.cancel'),
    onCancel?: () => void,
    secondaryLabel?: string,
    onSecondary?: () => void
  ) => {
    setAlertState({
      isOpen: true,
      title,
      message,
      kind,
      actionLabel,
      onAction,
      secondaryLabel,
      onSecondary,
      showCancel,
      cancelLabel,
      onCancel
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
            showAlert(
              t('alerts.updateAvailableTitle'),
              t('alerts.updateAvailableMessage', {
                local: updateRes.local_version || 'unknown',
                latest: updateRes.latest_version || 'unknown'
              }),
              'info',
              t('alerts.updateBtn'),
              async () => {
                if (config.scrcpyPath) {
                  setConfig(prev => ({ ...prev, scrcpyPath: undefined }));
                }
                await downloadScrcpy();
              },
              true,
              t('alerts.cancelBtn')
            );
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
        showAlert(t('alerts.appUpToDateTitle'), t('alerts.appUpToDateMsg', { v: appVersion }), 'info');
        return;
      }
      let total = 0;
      let done = 0;
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
        } else if (event.event === 'Progress') {
          done += event.data.chunkLength;
          if (total > 0) {
            const p = Math.min(100, Math.round((done / total) * 100));
            showAlert(t('about.autoDownloading'), t('about.autoProgress', { p }), 'info');
          }
        }
      });
      showAlert(t('about.autoInstalled'), t('about.autoRestarting'), 'success');
      await relaunch();
    } catch (e) {
      showAlert(
        t('about.autoFailTitle'),
        `${t('about.autoFailMsg')}\n\n${t('alerts.wirelessConsoleLabel')}: ${String(e)}`,
        'warning'
      );
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
    showAlert(
      t('alerts.newAppVersionTitle', { v: info.latest }),
      notes || t('alerts.newAppVersionMsg'),
      'info',
      t('about.autoUpdateBtn'),
      handleAutoUpdate,
      true,
      t('alerts.appCloseBtn'),
      undefined,
      t('alerts.updateOpenBtn'),
      async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('open_app_release');
        } catch {
          window.open('https://github.com/Umbr-Corp/OpenScrcpy/releases/latest', '_blank');
        }
      }
    );
  };

  const checkAppUpdate = async (silent: boolean) => {
    if (!isTauri()) return null;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const res = await invoke<{ update_available: boolean; current: string; latest: string; notes: string }>('check_app_update');
      if (res.update_available) setAppUpdateInfo(res);
      if (!silent) {
        if (res.update_available) openAppUpdateModal(res);
        else showAlert(t('alerts.appUpToDateTitle'), t('alerts.appUpToDateMsg', { v: res.current }), 'info');
      }
      return res;
    } catch {
      if (!silent) showAlert(t('alerts.appCheckFailedTitle'), t('alerts.appCheckFailedMsg'), 'warning');
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
        showAlert(t('alerts.wirelessOkTitle'), t('alerts.wirelessOkMsg', { ip: res.ip ?? '' }), 'success');
      } else {
        const detail = (res.message || '').trim();
        const hint = diagnoseWirelessFailure(detail);
        showAlert(
          t('alerts.wirelessFailTitle'),
          detail ? `${hint}\n\n${t('alerts.wirelessConsoleLabel')}: ${detail}` : hint,
          'warning'
        );
      }
    } catch (e) {
      const detail = String(e).trim();
      showAlert(
        t('alerts.wirelessFailTitle'),
        detail ? `${diagnoseWirelessFailure(detail)}\n\n${t('alerts.wirelessConsoleLabel')}: ${detail}` : t('alerts.wirelessHintGeneric'),
        'warning'
      );
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
        setLogs(prev => appendLogs(prev, t('logs.noDeviceForDragDrop')));
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

  useEffect(() => {
    // Live mic-bridge level (dB) and current destination emitted by the
    // Rust sidecar (Linux only).
    if (!isTauri()) return;
    const unlistenLevel = getCurrentWindow().listen<number>("mic-level", (event) => {
      const db = event.payload;
      setMicLevel(typeof db === 'number' && Number.isFinite(db) ? Math.round(db) : null);
    });
    const unlistenRoute = getCurrentWindow().listen<[string, boolean]>("mic-route", (event) => {
      const [sink, ok] = event.payload;
      setMicRoute({ sink, ok });
    });
    return () => {
      unlistenLevel.then(f => f());
      unlistenRoute.then(f => f());
    };
  }, []);

  useEffect(() => {
    if (!sessionRunning) {
      setMicLevel(null);
      setMicRoute(null);
    }
  }, [sessionRunning]);

  const handleStart = async () => {
    if (!activeDevice) {
      showAlert(t('alerts.noDeviceSelectedTitle'), t('alerts.noDeviceSelectedMessage'), "warning");
      return;
    }
    await runScrcpy(config);
  };

  const handleStop = async () => {
    if (!activeDevice) return;
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
        setLogs(prev => appendLogs(prev, t('logs.customScrcpyPathSet', { path: selected })));
        // Trigger a check with the new path
        setTimeout(() => checkScrcpy(selected), 100);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleResetPath = async () => {
    setConfig(prev => ({ ...prev, scrcpyPath: undefined }));
    setLogs(prev => appendLogs(prev, t('logs.customScrcpyPathCleared')));
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
                  micLevel={micLevel}
                  micRoute={micRoute}
                  detectedCameras={detectedCameras}
                  renderDriverSupport={renderDriverSupport}
                  onListOptions={(arg) => {
                    if (activeDevice) {
                      listScrcpyOptions(activeDevice, arg);
                    } else {
                      showAlert(
                        t('alerts.noDeviceSelectedTitle'),
                        t('alerts.noDeviceForListOptions'),
                        'warning'
                      );
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
