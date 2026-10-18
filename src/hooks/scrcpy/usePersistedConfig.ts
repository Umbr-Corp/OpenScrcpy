import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { loadStoredJSON } from './storage';
import { ScrcpyConfig } from './types';

const DEFAULT_CONFIG: ScrcpyConfig = {
    device: "",
    sessionMode: "mirror",
    bitrate: 8,
    fps: undefined,
    stayAwake: false,
    turnOff: false,
    audioEnabled: true,
    audioCodec: "auto",
    alwaysOnTop: false,
    res: "0",
    recordPath: "",
    vdWidth: 1920,
    vdHeight: 1080,
    vdDpi: 420,
    aspectRatioLock: true,
    hidKeyboard: false,
    hidMouse: false,
    // v4 features
    flexDisplay: false,
    cameraTorch: false,
    cameraZoom: 1.0,
    backgroundColor: '',
    keepActive: false,
    vsync: true,
    rememberWindowPosition: true,
    // v4.1 features
    ignoreVideoEncoderConstraints: false,
};

/** Everything that survives an app restart: the scrcpy config, the theme
 *  mode, and the recent-devices history. All pieces load synchronously from
 *  localStorage in their state initializers, so the first render already has
 *  the saved values (no effect-ordering race with the rest of the app). */
export function usePersistedConfig() {
    const [config, setConfig] = useState<ScrcpyConfig>(() => {
        const saved = loadStoredJSON<Partial<ScrcpyConfig> | null>('scrcpy_config', null);
        return saved ? { ...DEFAULT_CONFIG, ...saved } : DEFAULT_CONFIG;
    });

    const [colorMode, setColorModeState] = useState<'light' | 'dark' | 'system'>(() => {
        try {
            return (localStorage.getItem('scrcpy_color_mode') as 'light' | 'dark' | 'system') || 'system';
        } catch {
            return 'system';
        }
    });

    const [historyDevices, setHistoryDevices] = useState<string[]>(() => loadStoredJSON<string[]>('scrcpy_history', []));

    const [defaultRecordPath, setDefaultRecordPath] = useState<string>("");

    // Default recording folder: resolved from the backend once per mount, and
    // only fills recordPath when the user has not picked a folder yet.
    useEffect(() => {
        invoke<string>('get_videos_dir')
            .then((defaultDir: string) => {
                setDefaultRecordPath(defaultDir);
                setConfig(prev => (prev.recordPath ? prev : { ...prev, recordPath: defaultDir }));
            })
            .catch((e) => {
                console.error("Failed to fetch videos dir", e);
            });
    }, []);

    // Persist changes
    useEffect(() => {
        localStorage.setItem('scrcpy_config', JSON.stringify(config));
    }, [config]);

    useEffect(() => {
        const applyMode = (dark: boolean) => {
            document.documentElement.setAttribute('data-mode', dark ? 'dark' : 'light');
        };
        if (colorMode === 'system') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            applyMode(mq.matches);
            const handler = (e: MediaQueryListEvent) => applyMode(e.matches);
            mq.addEventListener('change', handler);
            return () => mq.removeEventListener('change', handler);
        } else {
            applyMode(colorMode === 'dark');
        }
    }, [colorMode]);

    const setColorMode = (mode: 'light' | 'dark' | 'system') => {
        setColorModeState(mode);
        localStorage.setItem('scrcpy_color_mode', mode);
    };

    const addToHistory = (ip: string) => {
        if (!ip.includes(':')) return; // Only add valid IP:Port combos
        setHistoryDevices(prev => {
            const next = [ip, ...prev.filter(d => d !== ip)].slice(0, 10); // Keep last 10 unique
            localStorage.setItem('scrcpy_history', JSON.stringify(next));
            return next;
        });
    };

    const clearHistory = () => {
        setHistoryDevices([]);
        localStorage.removeItem('scrcpy_history');
    };

    return { config, setConfig, defaultRecordPath, colorMode, setColorMode, historyDevices, addToHistory, clearHistory };
}
