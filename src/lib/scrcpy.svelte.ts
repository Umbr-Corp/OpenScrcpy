import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-dialog';
import { appendLogs, type LogEntry, type LogLevel } from './logs';
import { loadStoredJSON, safeGetItem, safeSetItem } from './storage';
import { isTauri } from './tauri';
import { showAlert } from './alerts.svelte';
import { t } from '../i18n';
import type {
    CommandResult,
    DeviceListResult,
    DownloadStatus,
    MdnsDevice,
    MdnsDevicesResult,
    RenderDriverSupport,
    ScrcpyConfig,
    ColorMode,
    MicSource,
    SessionMode,
    UnavailableDevice
} from './types';

export const DEFAULT_CONFIG: ScrcpyConfig = {
    device: '',
    sessionMode: 'mirror',
    bitrate: 8,
    fps: undefined,
    stayAwake: false,
    turnOff: false,
    audioEnabled: true,
    audioCodec: 'auto',
    alwaysOnTop: false,
    res: '0',
    recordPath: '',
    vdWidth: 1920,
    vdHeight: 1080,
    vdDpi: 420,
    aspectRatioLock: true,
    hidKeyboard: false,
    hidMouse: false,
    flexDisplay: false,
    cameraTorch: false,
    cameraZoom: 1.0,
    backgroundColor: '',
    keepActive: false,
    vsync: true,
    rememberWindowPosition: true,
    ignoreVideoEncoderConstraints: false
};

type WindowPositions = Record<string, { x: number; y: number }>;


const SESSION_MODES: SessionMode[] = ['mirror', 'camera', 'desktop', 'mic'];
const AUDIO_CODECS = ['auto', 'opus', 'aac', 'flac', 'raw'] as const;
const MIC_SOURCES = ['mic', 'mic-voice-communication'] as const;
const MIC_CODECS = ['opus', 'aac'] as const;
const ROTATIONS = ['0', '90', '180', '270'] as const;
const CAMERA_FACINGS = ['front', 'back', 'external'] as const;

/** Persisted config is a trust boundary: localStorage can be stale or edited.
 *  Normalize enums before the value reaches the store/backend. */
export function normalizeConfig(raw: Partial<ScrcpyConfig> | null): ScrcpyConfig {
    const config: ScrcpyConfig = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
    if (!SESSION_MODES.includes(config.sessionMode)) config.sessionMode = 'mirror';
    if (config.audioCodec && !AUDIO_CODECS.includes(config.audioCodec)) config.audioCodec = 'auto';

    // Older builds persisted "voice-communication"; the raw value can be any
    // string because localStorage is not typed.
    const rawMicSource = (raw as { micSource?: unknown } | null)?.micSource;
    if (rawMicSource === 'voice-communication') config.micSource = 'mic-voice-communication';
    else if (typeof rawMicSource === 'string' && !MIC_SOURCES.includes(rawMicSource as MicSource)) {
        config.micSource = 'mic';
    }
    if (config.micCodec && !MIC_CODECS.includes(config.micCodec)) config.micCodec = 'opus';
    if (config.rotation && !ROTATIONS.includes(config.rotation)) config.rotation = '0';
    if (config.cameraFacing && !CAMERA_FACINGS.includes(config.cameraFacing)) {
        config.cameraFacing = undefined;
    }
    return config;
}

class ScrcpyStore {
    config = $state<ScrcpyConfig>({ ...DEFAULT_CONFIG });
    colorMode = $state<ColorMode>('system');
    historyDevices = $state<string[]>([]);
    defaultRecordPath = $state('');
    logs = $state<LogEntry[]>([]);

    devices = $state<string[]>([]);
    deviceModels = $state<Record<string, string>>({});
    deviceFriendlyNames = $state<Record<string, string>>({});
    unavailableDevices = $state<UnavailableDevice[]>([]);
    mdnsDevices = $state<MdnsDevice[]>([]);
    activeDevice = $state('');
    isRefreshing = $state(false);

    runningDevices = $state<string[]>([]);
    isStarting = $state(false);
    detectedCameras = $state<{ id: string; name: string }[]>([]);
    windowPositions = $state<WindowPositions>({});
    wirelessSwitching = $state<string | null>(null);

    status = $state('');
    downloadProgress = $state(0);
    downloadError = $state<string | null>(null);
    isDownloading = $state(false);
    scrcpyStatus = $state<{ found: boolean; message: string }>({ found: false, message: 'Loading...' });
    renderDriverSupport = $state<RenderDriverSupport>({
        hostOs: 'unknown',
        supportsRenderDriver: false,
        supportedDrivers: []
    });
    isOnboardingOpen = $state(false);

    appVersion = $state('1.0.0');
    appUpdate = $state<{ latest: string; notes: string } | null>(null);
    ready = $state(false);

    private initialized = false;
    private starting = false;
    private downloading = false;
    private fetchInFlight: Promise<void> | null = null;
    private mounted = true;
    private prevDevices: string[] = [];
    private mdnsCache: MdnsDevice[] = [];
    private fetchedFriendlyNames = new Set<string>();
    private reconnectInFlight = new Set<string>();
    private reconnectBackoff: Record<string, { attempts: number; nextAt: number }> = {};
    private unlisteners: UnlistenFn[] = [];
    private intervals: ReturnType<typeof setInterval>[] = [];
    private startedModeByDevice: Record<string, SessionMode> = {};
    private scrcpyUpdateChecked = false;
    private colorMediaQuery: MediaQueryList | null = null;
    private colorMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;

    get sessionRunning(): boolean {
        return this.runningDevices.includes(this.activeDevice);
    }

    get recordingSupported(): boolean {
        return this.config.sessionMode !== 'mic';
    }

    addLogs = (lines: string | string[], level?: LogLevel) => {
        this.logs = appendLogs(this.logs, lines, level);
    };

    clearLogs = () => {
        this.logs = [];
    };

    setLogs = (next: LogEntry[] | ((prev: LogEntry[]) => LogEntry[])) => {
        this.logs = typeof next === 'function' ? next(this.logs) : next;
    };

    updateConfig = (patch: Partial<ScrcpyConfig>) => {
        this.config = { ...this.config, ...patch };
    };

    setConfig = (next: ScrcpyConfig) => {
        this.config = next;
    };

    setActiveDevice = (device: string) => {
        this.activeDevice = device;
        if (device) this.updateConfig({ device });
    };

    setColorMode = (mode: ColorMode) => {
        this.colorMode = mode;
        this.applyColorMode(mode);
        safeSetItem('scrcpy_color_mode', mode);
    };

    persistConfig = () => {
        safeSetItem('scrcpy_config', JSON.stringify(this.config));
    };

    persistWindowPositions = () => {
        safeSetItem('scrcpy_window_positions', JSON.stringify(this.windowPositions));
    };

    persistHistory = () => {
        safeSetItem('scrcpy_history', JSON.stringify(this.historyDevices));
    };

    addToHistory = (ip: string) => {
        if (!ip.includes(':')) return;
        this.historyDevices = [ip, ...this.historyDevices.filter(d => d !== ip)].slice(0, 10);
        this.persistHistory();
    };

    clearHistory = () => {
        this.historyDevices = [];
        this.persistHistory();
    };

    init = async () => {
        if (this.initialized) return;
        this.initialized = true;

        const savedConfig = loadStoredJSON<Partial<ScrcpyConfig> | null>('scrcpy_config', null);
        this.config = normalizeConfig(savedConfig);
        this.colorMode =
            (safeGetItem('scrcpy_color_mode') as ColorMode) || 'system';
        this.historyDevices = loadStoredJSON<string[]>('scrcpy_history', []);
        this.windowPositions = loadStoredJSON<WindowPositions>('scrcpy_window_positions', {});
        this.scrcpyStatus = { found: false, message: t('common.loading') };

        try {
            this.appVersion = await getVersion();
        } catch (e) {
            console.error('Initialization failed:', e);
        }

        this.defaultRecordPath = await invoke<string>('get_videos_dir').catch(() => '');
        if (!this.config.recordPath && this.defaultRecordPath) {
            this.config = { ...this.config, recordPath: this.defaultRecordPath };
        }

        this.applyColorMode(this.colorMode);
        await this.checkScrcpy(this.config.scrcpyPath);
        this.ready = true;
        void this.refreshDevicesUntilSettled(this.config.scrcpyPath);
        void this.checkForAppUpdate(true);

        if (!isTauri()) return;

        this.setupEventListeners();
        this.startPolling();
        void this.checkScrcpyUpdate();
    };

    destroy = () => {
        this.mounted = false;
        for (const unlisten of this.unlisteners) unlisten();
        this.unlisteners = [];
        for (const interval of this.intervals) clearInterval(interval);
        this.intervals = [];
        if (this.colorMediaQuery && this.colorMediaHandler) {
            this.colorMediaQuery.removeEventListener('change', this.colorMediaHandler);
            this.colorMediaQuery = null;
            this.colorMediaHandler = null;
        }
    };

    private setupEventListeners = () => {
        const status = listen<any>('scrcpy-status', event => {
            const data = event.payload;
            if (data.type === 'downloading') {
                this.isDownloading = true;
                this.downloadError = null;
                this.status = data.message;
            } else if (data.type === 'download-progress') {
                this.downloadProgress = data.percent;
            } else if (data.type === 'download-complete') {
                this.isDownloading = false;
                this.downloadError = null;
                this.status = t('logs.downloadComplete');
                void this.refreshDevicesUntilSettled();
                void this.checkScrcpy();
            }
            if (data.device && typeof data.running === 'boolean') {
                this.runningDevices = data.running
                    ? [...new Set([...this.runningDevices, data.device])]
                    : this.runningDevices.filter(d => d !== data.device);
            }
        });

        const windowPos = listen<{ device: string; x: number; y: number }>(
            'scrcpy-window-pos',
            event => {
                if (this.config.rememberWindowPosition === false) return;
                const { device, x, y } = event.payload;
                // The App-level effect persists this; writing here too caused
                // two localStorage writes per window-position event.
                this.windowPositions = { ...this.windowPositions, [device]: { x, y } };
            }
        );

        void Promise.all([status, windowPos])
            .then(fns => {
                if (this.mounted) this.unlisteners.push(...fns);
                else fns.forEach(fn => fn());
            })
            .catch(error => {
                console.error('Failed to subscribe to backend events', error);
            });
    };

    private startPolling = () => {
        this.intervals.push(
            setInterval(() => {
                if (document.visibilityState === 'hidden' || this.isRefreshing) return;
                void this.fetchDevicesOnce(undefined, true);
            }, 5000)
        );

        this.intervals.push(
            setInterval(() => this.tryReconnectHistory(), 25000)
        );
        this.tryReconnectHistory();
    };

    private applyColorMode = (mode: ColorMode) => {
        const apply = (dark: boolean) => {
            document.documentElement.setAttribute('data-mode', dark ? 'dark' : 'light');
        };

        if (this.colorMediaQuery && this.colorMediaHandler) {
            this.colorMediaQuery.removeEventListener('change', this.colorMediaHandler);
            this.colorMediaQuery = null;
            this.colorMediaHandler = null;
        }

        if (mode === 'system') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const handler = (event: MediaQueryListEvent) => apply(event.matches);
            apply(mq.matches);
            mq.addEventListener('change', handler);
            this.colorMediaQuery = mq;
            this.colorMediaHandler = handler;
        } else {
            apply(mode === 'dark');
        }
    };

    // ── Devices ────────────────────────────────────────────────────────────
    private fetchDevicesOnceUnlocked = async (customPath?: string, silent = false) => {
        try {
            const res = await invoke<DeviceListResult>('get_devices', {
                customPath: customPath || this.config.scrcpyPath
            });

            if (!res.error) {
                const newDevices = res.devices ?? [];
                if (res.deviceModels) this.deviceModels = res.deviceModels;

                const added = newDevices.filter(d => !this.prevDevices.includes(d));
                const removed = this.prevDevices.filter(d => !newDevices.includes(d));

                added.forEach(device => this.addLogs(t('logs.newDeviceDiscovered', { device }), 'ok'));
                removed.forEach(device => this.addLogs(t('logs.deviceDisconnected', { device }), 'warn'));

                this.devices = newDevices;
                this.unavailableDevices = res.unavailable ?? [];
                this.prevDevices = newDevices;
                newDevices.forEach(device => delete this.reconnectBackoff[device]);
                void this.ensureFriendlyNames(newDevices);

                if (!silent && added.length === 0 && removed.length === 0) {
                    this.addLogs(t('logs.discoveryActive', { count: newDevices.length }), 'system');
                }

                if (!newDevices.includes(this.activeDevice)) {
                    this.setActiveDevice(newDevices[0] ?? '');
                }
            } else {
                this.unavailableDevices = [];
                if (!silent) {
                    this.addLogs(t('logs.discoveryError', { error: res.message ?? 'unknown error' }), 'err');
                }
            }

            try {
                const mdnsRes = await invoke<MdnsDevicesResult>('get_mdns_devices', {
                    customPath: customPath || this.config.scrcpyPath
                });
                if (mdnsRes && !mdnsRes.error && mdnsRes.services) {
                    const parsed = mdnsRes.services.filter(
                        s =>
                            s.service &&
                            (s.service.includes('_adb-tls-connect') ||
                                s.service.includes('_adb-tls-pairing'))
                    );
                    this.mdnsDevices = parsed;
                    this.mdnsCache = parsed;
                } else if (mdnsRes && mdnsRes.error) {
                    console.warn('[ADB MDNS] Failed to get mdns devices:', mdnsRes.message);
                    this.mdnsDevices = [];
                    this.mdnsCache = [];
                }
            } catch (e) {
                console.error('Failed to query mDNS devices:', e);
            }
        } catch (e) {
            console.error(e);
            this.addLogs(t('logs.errorRefreshingDevices', { error: String(e) }), 'err');
        }
    };

    private ensureFriendlyNames = async (serials: string[]) => {
        for (const serial of serials) {
            if (this.fetchedFriendlyNames.has(serial)) continue;
            this.fetchedFriendlyNames.add(serial);
            const isEmulator = /^emulator-\d+$/.test(serial);
            try {
                const command = isEmulator
                    ? 'getprop ro.boot.qemu.avd_name; getprop ro.kernel.qemu.avd_name'
                    : 'getprop ro.product.marketname; getprop ro.product.manufacturer; getprop ro.product.model';
                const res = await invoke<CommandResult>('adb_shell', {
                    device: serial,
                    command,
                    customPath: this.config.scrcpyPath
                });

                if (isEmulator) {
                    const avdName = res?.success
                        ? (res.output ?? '')
                              .split('\n')
                              .map(line => line.trim())
                              .find(line => line.length > 0)
                        : undefined;
                    this.deviceFriendlyNames = {
                        ...this.deviceFriendlyNames,
                        [serial]: avdName ? `${avdName.replace(/_/g, ' ')} (${serial})` : serial
                    };
                    continue;
                }

                if (res?.success) {
                    const [marketname, manufacturer, model] = (res.output ?? '')
                        .split('\n')
                        .map(line => line.trim());
                    const name =
                        marketname ||
                        (manufacturer &&
                        model &&
                        !model.toLowerCase().startsWith(manufacturer.toLowerCase())
                            ? `${manufacturer} ${model}`
                            : model);
                    if (name) {
                        this.deviceFriendlyNames = { ...this.deviceFriendlyNames, [serial]: name };
                    }
                }
            } catch (e) {
                console.error('Failed to fetch friendly name for', serial, e);
            }
        }
    };

    private fetchDevicesOnce = (customPath?: string, silent = false): Promise<void> => {
        if (this.fetchInFlight) return this.fetchInFlight;
        const run = this.fetchDevicesOnceUnlocked(customPath, silent);
        let tracked: Promise<void>;
        tracked = run.finally(() => {
            if (this.fetchInFlight === tracked) this.fetchInFlight = null;
        });
        this.fetchInFlight = tracked;
        return tracked;
    };

    refreshDevices = async (customPath?: string, silent = false) => {
        if (this.isRefreshing) return;
        this.isRefreshing = true;
        try {
            await this.fetchDevicesOnce(customPath, silent);
        } finally {
            this.isRefreshing = false;
        }
    };

    refreshDevicesUntilSettled = async (customPath?: string, attempts = 8, delayMs = 2000) => {
        if (this.isRefreshing) return;
        this.isRefreshing = true;
        try {
            let prevSnapshot = '';
            for (let i = 0; i <= attempts; i++) {
                if (!this.mounted) return;
                await this.fetchDevicesOnce(customPath, true);
                if (!this.mounted) return;
                const snapshot = JSON.stringify([this.prevDevices, this.mdnsCache]);
                if (snapshot === prevSnapshot) return;
                prevSnapshot = snapshot;
                if (i < attempts) await new Promise(r => setTimeout(r, delayMs));
            }
        } finally {
            if (this.mounted) this.isRefreshing = false;
        }
    };

    private tryReconnectHistory = () => {
        if (document.visibilityState === 'hidden') return;
        const now = Date.now();
        this.historyDevices.forEach(ip => {
            if (this.prevDevices.includes(ip)) return;
            if (this.reconnectInFlight.has(ip)) return;
            const backoff = this.reconnectBackoff[ip];
            if (backoff && now < backoff.nextAt) return;

            this.reconnectInFlight.add(ip);
            invoke<CommandResult>('adb_connect', {
                ip,
                customPath: this.config.scrcpyPath,
                silent: true
            })
                .then(res => {
                    if (res?.success) delete this.reconnectBackoff[ip];
                    else this.scheduleReconnect(ip);
                })
                .catch(() => this.scheduleReconnect(ip))
                .finally(() => this.reconnectInFlight.delete(ip));
        });
    };

    private scheduleReconnect = (ip: string) => {
        const attempts = (this.reconnectBackoff[ip]?.attempts ?? 0) + 1;
        const delay = Math.min(25000 * 2 ** (attempts - 1), 5 * 60_000);
        this.reconnectBackoff[ip] = { attempts, nextAt: Date.now() + delay };
    };

    pairDevice = async (ip: string, code: string, customPath?: string): Promise<CommandResult> => {
        try {
            const res = await invoke<CommandResult>('adb_pair', {
                ip,
                code,
                customPath: customPath || this.config.scrcpyPath
            });
            if (res.success) {
                this.addLogs(t('logs.successfullyPaired', { ip }), 'ok');
                await this.refreshDevicesUntilSettled(customPath);
            } else {
                const msgs = [t('logs.pairingFailed', { message: String(res.message) })];
                if (typeof res.message === 'string' && res.message.includes('protocol fault')) {
                    msgs.push(t('logs.pairingProtocolFault'));
                }
                this.addLogs(msgs);
            }
            return res;
        } catch (e: any) {
            this.addLogs(t('logs.pairingError', { error: String(e) }), 'err');
            return { success: false, message: String(e) };
        }
    };

    connectDevice = async (ip: string, customPath?: string): Promise<CommandResult> => {
        this.isRefreshing = true;
        try {
            const target = ip.includes(':') ? ip : `${ip}:5555`;
            let res = await invoke<CommandResult>('adb_connect', {
                ip: target,
                customPath: customPath || this.config.scrcpyPath
            });

            if (
                !res.success &&
                typeof res.message === 'string' &&
                (res.message.includes('failed to connect') || res.message.includes('cannot connect'))
            ) {
                this.addLogs(t('logs.connectionFailedRetrying'), 'warn');
                await invoke<CommandResult>('run_terminal_command', {
                    cmd: `adb disconnect ${target}`,
                    customPath: customPath || this.config.scrcpyPath
                });
                await new Promise(r => setTimeout(r, 500));
                res = await invoke<CommandResult>('adb_connect', {
                    ip: target,
                    customPath: customPath || this.config.scrcpyPath
                });
            }

            if (res.success) {
                this.addLogs(t('logs.connectedSuccessfully', { ip: target }), 'ok');
                this.addToHistory(target);
                delete this.reconnectBackoff[target];
                await new Promise(r => setTimeout(r, 1000));
                this.isRefreshing = false;
                await this.refreshDevices(customPath || this.config.scrcpyPath, true);
            } else {
                const msgs = [t('logs.connectionFailed', { message: String(res.message) })];
                if (
                    typeof res.message === 'string' &&
                    (res.message.includes('failed to connect') || res.message.includes('cannot connect'))
                ) {
                    msgs.push(t('logs.connectionStaleTip'));
                }
                this.addLogs(msgs);
            }
            return res;
        } catch (e: any) {
            this.addLogs(t('logs.connectionError', { error: String(e) }), 'err');
            return { success: false, message: String(e) };
        } finally {
            this.isRefreshing = false;
        }
    };

    // ── Session ────────────────────────────────────────────────────────────
    runScrcpy = async (config: ScrcpyConfig) => {
        if (this.starting) return;
        this.starting = true;
        this.isStarting = true;
        try {
            this.addLogs(t('logs.initializingScrcpy', { device: config.device }), 'system');
            const savedPos =
                config.rememberWindowPosition !== false
                    ? this.windowPositions[config.device]
                    : undefined;
            await invoke('run_scrcpy', {
                config: { ...config, windowX: savedPos?.x, windowY: savedPos?.y }
            });
        } catch (e: any) {
            this.addLogs(t('logs.failedToStartScrcpy', { error: String(e) }), 'err');
        } finally {
            this.starting = false;
            this.isStarting = false;
        }
    };

    startSession = async () => {
        if (!this.activeDevice) {
            showAlert({
                title: t('alerts.noDeviceSelectedTitle'),
                message: t('alerts.noDeviceSelectedMessage'),
                kind: 'warning'
            });
            return;
        }

        const runningMode = this.runningDevices.includes(this.activeDevice)
            ? this.startedModeByDevice[this.activeDevice]
            : undefined;
        const modeLabels: Record<SessionMode, string> = {
            mirror: 'controlPanel.screen',
            camera: 'controlPanel.camera',
            desktop: 'controlPanel.desktop',
            mic: 'controlPanel.microphone'
        };

        if (runningMode && runningMode !== this.config.sessionMode) {
            showAlert({
                title: t('alerts.sessionReplaceTitle'),
                message: t('alerts.sessionReplaceMsg', {
                    mode: t(modeLabels[runningMode] ?? runningMode),
                    newMode: t(modeLabels[this.config.sessionMode] ?? this.config.sessionMode)
                }),
                kind: 'warning',
                actionLabel: t('alerts.sessionReplaceConfirm'),
                onAction: () => this.performStart(),
                showCancel: true
            });
            return;
        }
        await this.performStart();
    };

    private performStart = async () => {
        if (this.activeDevice) {
            this.startedModeByDevice[this.activeDevice] = this.config.sessionMode;
        }
        await this.runScrcpy(this.config);
    };

    stopSession = async () => {
        if (!this.activeDevice) return;
        delete this.startedModeByDevice[this.activeDevice];
        await this.stopScrcpy(this.activeDevice);
    };

    stopScrcpy = async (device: string) => {
        try {
            await invoke('stop_scrcpy', { device });
        } catch (e) {
            const message = String(e);
            this.addLogs(t('logs.failedToStopScrcpy', { error: message }), 'err');
            showAlert({
                title: t('alerts.stopFailedTitle'),
                message: t('alerts.stopFailedMsg', { error: message }),
                kind: 'error'
            });
        }
    };

    recenterMirrorWindow = async (device: string) => {
        try {
            await invoke('recenter_scrcpy_window', { device });
        } catch (e) {
            console.error(e);
        }
    };

    listScrcpyOptions = async (device: string, arg: string, customPath?: string): Promise<CommandResult> => {
        try {
            this.addLogs(t('logs.runningScrcpyArg', { arg }), 'system');
            const res = await invoke<CommandResult>('list_scrcpy_options', {
                device,
                arg,
                customPath: customPath || this.config.scrcpyPath
            });
            if (res.output) {
                const lines = res.output.split('\n');
                this.addLogs(lines);
                if (arg === '--list-cameras') {
                    const cameras: { id: string; name: string }[] = [];
                    lines.forEach(line => {
                        const trimmed = line.trim();
                        const next = trimmed.match(/--camera-id=(\w+)\s*\((.*?)\)/);
                        const old = trimmed.match(/^(?:-\s*)?\[(\w+)\]\s*\((.*?)\)\s*(.*)/);
                        if (next) {
                            cameras.push({ id: next[1], name: `${next[1]}: ${next[2]}` });
                        } else if (old) {
                            const resolution = old[2];
                            const metadata = old[3].replace(/\r$/, '').trim();
                            cameras.push({
                                id: old[1],
                                name: `${old[1]}: ${metadata || 'Camera'} (${resolution})`
                            });
                        }
                    });
                    if (cameras.length > 0) this.detectedCameras = cameras;
                    else this.addLogs(t('logs.noCamerasParsed'), 'warn');
                }
            }
            return res;
        } catch (e: any) {
            this.addLogs(t('logs.genericError', { error: String(e) }), 'err');
            return { success: false, message: String(e) };
        }
    };

    pushFile = async (device: string, filePath: string, customPath?: string): Promise<CommandResult> => {
        try {
            this.addLogs(t('logs.pushingFile', { device, filePath }), 'system');
            const res = await invoke<CommandResult>('push_file', {
                device,
                filePath,
                customPath: customPath || this.config.scrcpyPath
            });
            this.addLogs(t('logs.adbPrefix', { message: String(res.message) }));
            return res;
        } catch (e: any) {
            this.addLogs(t('logs.genericError', { error: String(e) }), 'err');
            return { success: false, message: String(e) };
        }
    };

    installApk = async (device: string, filePath: string, customPath?: string): Promise<CommandResult> => {
        try {
            this.addLogs(t('logs.installingApk', { device, filePath }), 'system');
            const res = await invoke<CommandResult>('install_apk', {
                device,
                filePath,
                customPath: customPath || this.config.scrcpyPath
            });
            this.addLogs(t('logs.adbPrefix', { message: String(res.message) }));
            return res;
        } catch (e: any) {
            this.addLogs(t('logs.genericError', { error: String(e) }), 'err');
            return { success: false, message: String(e) };
        }
    };

    runTerminalCommand = async (command: string, customPath?: string): Promise<CommandResult> => {
        try {
            const lower = command.trim().toLowerCase();
            const prefix = lower.startsWith('scrcpy') || lower.startsWith('adb') ? '' : 'adb ';
            this.addLogs(`> ${prefix}${command}`, 'system');
            const res = await invoke<CommandResult>('run_terminal_command', {
                device: this.activeDevice,
                cmd: command,
                customPath: customPath || this.config.scrcpyPath
            });
            if (res.stdout) this.addLogs(res.stdout.trim().split('\n'));
            if (res.stderr) {
                this.addLogs(
                    res.stderr
                        .trim()
                        .split('\n')
                        .map(l => `[${res.binary?.toUpperCase() || 'ERR'}] ${l}`)
                );
            }
            if (!res.success && res.message) {
                this.addLogs(t('logs.commandFailed', { error: String(res.message) }), 'err');
            }
            return res;
        } catch (e: any) {
            this.addLogs(t('logs.commandFailed', { error: String(e) }), 'err');
            return { success: false, message: String(e) };
        }
    };

    handleFileOperation = async (path: string) => {
        if (!this.activeDevice) return;
        if (path.toLowerCase().endsWith('.apk')) {
            await this.installApk(this.activeDevice, path);
        } else {
            await this.pushFile(this.activeDevice, path);
        }
    };

    handleFileBrowse = async () => {
        if (!this.activeDevice) return;
        try {
            const selected = await open({
                multiple: true,
                filters: [
                    { name: 'All Files', extensions: ['*'] },
                    { name: 'Android App (APK)', extensions: ['apk'] }
                ]
            });
            if (selected) {
                const paths = Array.isArray(selected) ? selected : [selected];
                for (const path of paths) await this.handleFileOperation(path);
            }
        } catch (e) {
            console.error(e);
        }
    };

    handleKillAdb = async () => {
        try {
            await invoke('kill_adb', { customPath: this.config.scrcpyPath });
            await this.refreshDevices(this.config.scrcpyPath);
        } catch (e) {
            console.error(e);
        }
    };

    handleSetPath = async () => {
        try {
            let startPath = this.config.scrcpyPath;
            if (!startPath) {
                startPath = await invoke<string>('get_scrcpy_bin_dir').catch(() => '');
            }
            const selected = await open({
                directory: true,
                multiple: false,
                defaultPath: startPath || undefined
            });
            if (selected && typeof selected === 'string') {
                this.updateConfig({ scrcpyPath: selected });
                this.addLogs(t('logs.customScrcpyPathSet', { path: selected }), 'system');
                void this.checkScrcpy(selected);
            }
        } catch (e) {
            console.error(e);
        }
    };

    handleResetPath = async () => {
        this.updateConfig({ scrcpyPath: undefined });
        this.addLogs(t('logs.customScrcpyPathCleared'), 'system');
        void this.checkScrcpy('');
    };

    handleGotoWireless = async (device: string) => {
        if (this.wirelessSwitching) return;
        this.wirelessSwitching = device;
        try {
            const res = await invoke<{ success: boolean; message: string; ip?: string }>(
                'goto_wireless',
                { device }
            );
            if (res.success) {
                if (res.ip) this.addToHistory(`${res.ip}:5555`);
                showAlert({
                    title: t('alerts.wirelessOkTitle'),
                    message: t('alerts.wirelessOkMsg', { ip: res.ip ?? '' }),
                    kind: 'success'
                });
            } else {
                const detail = (res.message || '').trim();
                showAlert({
                    title: t('alerts.wirelessFailTitle'),
                    message: detail
                        ? `${this.diagnoseWirelessFailure(detail)}\n\n${t('alerts.wirelessConsoleLabel')}: ${detail}`
                        : this.diagnoseWirelessFailure(detail),
                    kind: 'warning'
                });
            }
        } catch (e) {
            const detail = String(e).trim();
            showAlert({
                title: t('alerts.wirelessFailTitle'),
                message: detail
                    ? `${this.diagnoseWirelessFailure(detail)}\n\n${t('alerts.wirelessConsoleLabel')}: ${detail}`
                    : t('alerts.wirelessHintGeneric'),
                kind: 'warning'
            });
        } finally {
            this.wirelessSwitching = null;
            void this.refreshDevices();
        }
    };

    private diagnoseWirelessFailure = (message: string): string => {
        if (/authenticate|unauthorized/i.test(message)) return t('alerts.wirelessHintAuth');
        if (/timed ?out|cannot connect|not connected|failed to connect/i.test(message)) {
            return t('alerts.wirelessHintConn');
        }
        return t('alerts.wirelessHintGeneric');
    };

    // ── Downloads ──────────────────────────────────────────────────────────
    downloadScrcpy = async () => {
        if (this.downloading) return;
        this.downloading = true;
        try {
            this.isDownloading = true;
            this.downloadError = null;
            await invoke('download_scrcpy');
        } catch (e: any) {
            this.isDownloading = false;
            const message = t('onboarding.downloadFailed');
            this.downloadError = message;
            this.addLogs(t('logs.downloadError', { error: String(e) }), 'err');
            if (!this.isOnboardingOpen) {
                showAlert({ title: t('alerts.downloadFailedTitle'), message, kind: 'error' });
            }
        } finally {
            this.downloading = false;
        }
    };

    checkScrcpy = async (customPath?: string): Promise<boolean> => {
        try {
            const pathToCheck = customPath !== undefined ? customPath : this.config.scrcpyPath;
            const res = await invoke<DownloadStatus>('check_scrcpy', { customPath: pathToCheck });
            this.scrcpyStatus = res;

            if (res.found) {
                try {
                    const renderRes = await invoke<Partial<RenderDriverSupport>>(
                        'get_render_drivers',
                        { customPath: pathToCheck }
                    );
                    this.renderDriverSupport = {
                        hostOs: renderRes?.hostOs || 'unknown',
                        supportsRenderDriver: !!renderRes?.supportsRenderDriver,
                        supportedDrivers: Array.isArray(renderRes?.supportedDrivers)
                            ? renderRes.supportedDrivers
                            : []
                    };
                } catch {
                    this.renderDriverSupport = {
                        hostOs: 'unknown',
                        supportsRenderDriver: false,
                        supportedDrivers: []
                    };
                }
            } else {
                this.renderDriverSupport = {
                    hostOs: 'unknown',
                    supportsRenderDriver: false,
                    supportedDrivers: []
                };
            }

            if (!res.found && safeGetItem('scrcpy_onboarding_done') !== 'true') {
                this.isOnboardingOpen = true;
            }
            if (res.found) void this.checkScrcpyUpdate();
            return res.found;
        } catch (e: any) {
            this.scrcpyStatus = {
                found: false,
                message: t('logs.genericError', { error: String(e) })
            };
            return false;
        }
    };

    completeOnboarding = () => {
        safeSetItem('scrcpy_onboarding_done', 'true');
        this.isOnboardingOpen = false;
    };

    // ── App update ─────────────────────────────────────────────────────────
    checkForAppUpdate = async (silent: boolean) => {
        if (!isTauri()) return null;
        try {
            const { check } = await import('@tauri-apps/plugin-updater');
            const update = await check();
            const info = update ? { latest: update.version, notes: update.body ?? '' } : null;
            this.appUpdate = info;
            if (!silent) {
                if (info) this.openAppUpdateModal(info);
                else {
                    showAlert({
                        title: t('alerts.appUpToDateTitle'),
                        message: t('alerts.appUpToDateMsg', { v: this.appVersion }),
                        kind: 'info'
                    });
                }
            }
            return info;
        } catch {
            if (!silent) {
                showAlert({
                    title: t('alerts.appCheckFailedTitle'),
                    message: t('alerts.appCheckFailedMsg'),
                    kind: 'warning'
                });
            }
            return null;
        }
    };

    openAppUpdateModal = (info: { latest: string; notes: string }) => {
        const notes = (info.notes || '')
            .replace(/^#{1,4}\s?/gm, '')
            .replace(/^>\s?/gm, '')
            .replace(/[*`]/g, '')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line && !/^what'?s changed$/i.test(line) && !/^full changelog:/i.test(line))
            .join('\n')
            .trim();
        const isPlaceholder = /^see the assets below for the release\.?$/i.test(notes);
        showAlert({
            title: t('alerts.newAppVersionTitle'),
            message: notes && !isPlaceholder ? notes : t('alerts.newAppVersionMsg'),
            kind: 'info',
            eyebrow: `v${this.appVersion} → v${info.latest}`,
            actionLabel: t('header.autoUpdateBtn'),
            onAction: () => this.handleAutoUpdate(),
            showCancel: true,
            cancelLabel: t('alerts.appCloseBtn'),
            secondaryLabel: t('alerts.updateOpenBtn'),
            onSecondary: async () => {
                try {
                    await invoke('open_app_release');
                } catch {
                    window.open(
                        'https://v16.next.forgejo.org/UmbrCorp/OpenScrcpy/releases/latest',
                        '_blank'
                    );
                }
            }
        });
    };

    handleAutoUpdate = async () => {
        try {
            const { check } = await import('@tauri-apps/plugin-updater');
            const { relaunch } = await import('@tauri-apps/plugin-process');
            const update = await check();
            if (!update) {
                showAlert({
                    title: t('alerts.appUpToDateTitle'),
                    message: t('alerts.appUpToDateMsg', { v: this.appVersion }),
                    kind: 'info'
                });
                return;
            }
            let total = 0;
            let done = 0;
            let lastShownPct = -1;
            const fmtMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
            await update.downloadAndInstall(event => {
                if (event.event === 'Started') {
                    total = event.data.contentLength ?? 0;
                    if (total > 0) {
                        lastShownPct = 0;
                        showAlert({
                            title: t('header.autoDownloading'),
                            message: t('header.autoProgress', { p: 0 }),
                            kind: 'info',
                            progress: 0,
                            progressDetail: `0/${fmtMb(total)} MB`
                        });
                    }
                } else if (event.event === 'Progress') {
                    done += event.data.chunkLength;
                    if (total > 0) {
                        const p = Math.min(100, Math.round((done / total) * 100));
                        if (p !== lastShownPct) {
                            lastShownPct = p;
                            showAlert({
                                title: t('header.autoDownloading'),
                                message: t('header.autoProgress', { p }),
                                kind: 'info',
                                progress: p,
                                progressDetail: `${fmtMb(done)}/${fmtMb(total)} MB`
                            });
                        }
                    }
                }
            });
            showAlert({
                title: t('header.autoInstalled'),
                message: t('header.autoRestarting'),
                kind: 'success'
            });
            await new Promise(resolve => setTimeout(resolve, 1200));
            await relaunch();
        } catch (e) {
            showAlert({
                title: t('header.autoFailTitle'),
                message: `${t('header.autoFailMsg')}\n\n${t('alerts.wirelessConsoleLabel')}: ${String(e)}`,
                kind: 'warning'
            });
        }
    };

    checkScrcpyUpdate = async () => {
        if (this.scrcpyUpdateChecked || !this.scrcpyStatus.found || this.isDownloading) return;
        this.scrcpyUpdateChecked = true;
        try {
            const updateRes: any = await invoke('check_scrcpy_update', {
                customPath: this.config.scrcpyPath
            });
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
                        if (this.config.scrcpyPath) this.updateConfig({ scrcpyPath: undefined });
                        await this.downloadScrcpy();
                    },
                    showCancel: true,
                    cancelLabel: t('alerts.cancelBtn')
                });
            }
        } catch (e) {
            console.error('Failed to check for scrcpy updates:', e);
        }
    };
}

export const scrcpy = new ScrcpyStore();
