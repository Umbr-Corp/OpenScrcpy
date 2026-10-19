import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useI18n } from '../../i18n';
import { isTauri } from '../../tauri';
import { LogLevel } from '../../logs';
import { loadStoredJSON } from './storage';
import { ScrcpyConfig } from './types';

/** Last known screen position of the scrcpy window, per device serial. Keyed
 *  by device because different devices (e.g. a phone vs. a tablet) produce
 *  very differently sized windows: a single shared position would reopen an
 *  unrelated device's window mostly off-screen. */
type WindowPositions = Record<string, { x: number; y: number }>;

interface UseSessionOptions {
    /** Saved scrcpy binary path, used as the fallback for every adb/scrcpy
     *  call that wasn't given an explicit customPath. */
    scrcpyPath?: string;
    /** Device currently selected in the hub; used by the terminal command
     *  runner and cleared from whenever it changes. */
    activeDevice: string;
    /** config.rememberWindowPosition, forwarded raw: the ref below converts
     *  the possible undefined to its "on unless false" semantics. */
    rememberWindowPosition?: boolean;
    addLogs: (lines: string | string[], level?: LogLevel) => void;
}

/** Mirror sessions and device-side actions: launching/stopping scrcpy,
 *  restoring the per-device window position, camera detection, and the adb
 *  file/command helpers driven from the terminal + tools panel. */
export function useSession({ scrcpyPath, activeDevice, rememberWindowPosition, addLogs }: UseSessionOptions) {
    const { t } = useI18n();
    // Devices with a live mirror session, fed by the backend's scrcpy-status
    // events; sessionRunning in the hub is derived from this + activeDevice.
    const [runningDevices, setRunningDevices] = useState<string[]>([]);
    const [detectedCameras, setDetectedCameras] = useState<{ id: string, name: string }[]>([]);
    const [windowPositions, setWindowPositions] = useState<WindowPositions>(() => loadStoredJSON<WindowPositions>('scrcpy_window_positions', {}));
    const rememberWindowPositionRef = useRef(true);

    // Kept in a ref (not read from the prop directly) so the window-position
    // listener below, which only subscribes once on mount, always sees the
    // current value without needing to resubscribe on every config change.
    useEffect(() => {
        rememberWindowPositionRef.current = rememberWindowPosition !== false;
    }, [rememberWindowPosition]);

    useEffect(() => {
        localStorage.setItem('scrcpy_window_positions', JSON.stringify(windowPositions));
    }, [windowPositions]);

    useEffect(() => {
        // No backend event source outside the Tauri WebView.
        if (!isTauri()) return;

        const unlistenStatus = listen<any>('scrcpy-status', (event) => {
            const data = event.payload;
            if (data.device && typeof data.running === 'boolean') {
                setRunningDevices(prev => {
                    if (data.running) {
                        return [...new Set([...prev, data.device])];
                    } else {
                        return prev.filter(d => d !== data.device);
                    }
                });
            }
        });

        // Persist the scrcpy window position emitted when a session ends, so the
        // next launch restores it (via --window-x / --window-y). This is what
        // lets a borderless window, which cannot be dragged, reopen where the
        // user placed it with borders. Keyed by device (not stored on the
        // shared config): different devices produce very differently sized
        // windows (e.g. a phone vs. a tablet), so a single shared position
        // would reopen an unrelated device's window mostly off-screen.
        const unlistenWindowPos = listen<{ device: string; x: number; y: number }>(
            'scrcpy-window-pos',
            (event) => {
                if (!rememberWindowPositionRef.current) return;
                const { device, x, y } = event.payload;
                setWindowPositions(prev => ({ ...prev, [device]: { x, y } }));
            }
        );

        return () => {
            unlistenStatus.then(f => f());
            unlistenWindowPos.then(f => f());
        };
    }, []);

    // Clear detected cameras when device changes
    useEffect(() => {
        setDetectedCameras([]);
    }, [activeDevice]);

    const runScrcpy = async (config: ScrcpyConfig) => {
        try {
            addLogs(t('logs.initializingScrcpy', { device: config.device }), 'system');
            // Resolve the saved position for this specific device only, so
            // launching one device never reuses another device's window spot.
            const savedPos = config.rememberWindowPosition !== false ? windowPositions[config.device] : undefined;
            const configWithPos: ScrcpyConfig = {
                ...config,
                windowX: savedPos?.x,
                windowY: savedPos?.y
            };
            await invoke('run_scrcpy', { config: configWithPos });
        } catch (e: any) {
            addLogs(t('logs.failedToStartScrcpy', { error: String(e) }), 'err');
        }
    };

    const stopScrcpy = async (device: string) => {
        try {
            await invoke('stop_scrcpy', { device });
        } catch (e) {
            console.error(e);
        }
    };

    /** Snaps the running mirror window for `device` back to the centre of the
     *  primary screen. Recovers a window whose saved position no longer lands
     *  on any connected monitor (e.g. it was saved on a second monitor that
     *  has since been unplugged), so it never gets stuck off-screen with no
     *  way to reach it. */
    const recenterMirrorWindow = async (device: string) => {
        try {
            await invoke('recenter_scrcpy_window', { device });
        } catch (e) {
            console.error(e);
        }
    };

    const listScrcpyOptions = async (device: string, arg: string, customPath?: string) => {
        try {
            addLogs(t('logs.runningScrcpyArg', { arg }), 'system');
            const res: any = await invoke('list_scrcpy_options', { device, arg, customPath: customPath || scrcpyPath });
            if (res.output) {
                const lines = res.output.split('\n');
                addLogs(lines);

                // Parse cameras if requested
                if (arg === '--list-cameras') {
                    const cameras: { id: string, name: string }[] = [];
                    lines.forEach((line: string) => {
                        const trimmedLine = line.trim();
                        // New format (scrcpy 3.x): "    --camera-id=0    (back, 4080x3060, fps=[15, 20, 24, 30])"
                        // Old format: "    - [0] (3264x2448) back, macro"
                        const newMatch = trimmedLine.match(/--camera-id=(\w+)\s*\((.*?)\)/);
                        const oldMatch = trimmedLine.match(/^(?:-\s*)?\[(\w+)\]\s*\((.*?)\)\s*(.*)/);

                        if (newMatch) {
                            const id = newMatch[1];
                            const details = newMatch[2]; // e.g. "back, 4080x3060, fps=[...]"
                            cameras.push({
                                id,
                                name: `${id}: ${details}`
                            });
                        } else if (oldMatch) {
                            const id = oldMatch[1];
                            const resolution = oldMatch[2];
                            const metadata = oldMatch[3].replace(/\r$/, '').trim();
                            cameras.push({
                                id,
                                name: `${id}: ${metadata || 'Camera'} (${resolution})`
                            });
                        }
                    });
                    if (cameras.length > 0) {
                        setDetectedCameras(cameras);
                    } else {
                        addLogs(t('logs.noCamerasParsed'), 'warn');
                    }
                }
            }
            return res;
        } catch (e: any) {
            addLogs(t('logs.genericError', { error: String(e) }), 'err');
            return { success: false, message: e };
        }
    };

    const pushFile = async (device: string, filePath: string, customPath?: string) => {
        try {
            addLogs(t('logs.pushingFile', { device, filePath }), 'system');
            const res: any = await invoke('push_file', { device, filePath, customPath: customPath || scrcpyPath });
            addLogs(t('logs.adbPrefix', { message: String(res.message) }));
            return res;
        } catch (e: any) {
            addLogs(t('logs.genericError', { error: String(e) }), 'err');
            return { success: false, message: e };
        }
    };

    const installApk = async (device: string, filePath: string, customPath?: string) => {
        try {
            addLogs(t('logs.installingApk', { device, filePath }), 'system');
            const res: any = await invoke('install_apk', { device, filePath, customPath: customPath || scrcpyPath });
            addLogs(t('logs.adbPrefix', { message: String(res.message) }));
            return res;
        } catch (e: any) {
            addLogs(t('logs.genericError', { error: String(e) }), 'err');
            return { success: false, message: e };
        }
    };

    const runTerminalCommand = async (command: string, customPath?: string) => {
        try {
            // Check if user specifically typed scrcpy or adb to format log nicely
            const lower = command.trim().toLowerCase();
            const prefix = (lower.startsWith('scrcpy') || lower.startsWith('adb')) ? '' : 'adb ';
            addLogs(`> ${prefix}${command}`, 'system');

            const res: any = await invoke('run_terminal_command', {
                device: activeDevice,
                cmd: command,
                customPath: customPath || scrcpyPath
            });

            if (res.stdout) {
                const lines = res.stdout.trim().split('\n');
                addLogs(lines);
            }
            if (res.stderr) {
                const lines = res.stderr.trim().split('\n').map((l: string) => `[${res.binary?.toUpperCase() || 'ERR'}] ${l}`);
                addLogs(lines);
            }
            return res;
        } catch (e: any) {
            addLogs(t('logs.commandFailed', { error: String(e) }), 'err');
            return { success: false, message: e };
        }
    };

    return {
        runningDevices,
        detectedCameras,
        runScrcpy,
        stopScrcpy,
        recenterMirrorWindow,
        listScrcpyOptions,
        pushFile,
        installApk,
        runTerminalCommand,
    };
}
