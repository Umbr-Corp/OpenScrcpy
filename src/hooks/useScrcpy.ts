import { useLogs } from './scrcpy/useLogs';
import { usePersistedConfig } from './scrcpy/usePersistedConfig';
import { useDevices } from './scrcpy/useDevices';
import { useSession } from './scrcpy/useSession';
import { useDownloads } from './scrcpy/useDownloads';

// Re-exported here so consumers (ControlPanel, Sidebar, SessionBehavior,
// tests) can keep importing these types from '../hooks/useScrcpy'.
export * from './scrcpy/types';

/**
 * Composition root for the scrcpy frontend state. The actual logic lives in
 * the focused hooks under `./scrcpy/`:
 *
 *  - `usePersistedConfig` -- config, theme mode, recent-devices history,
 *    everything that survives a restart.
 *  - `useLogs` -- the single shared terminal log stream.
 *  - `useDevices` -- discovery, labels, mDNS, pairing/connect flows.
 *  - `useSession` -- mirror sessions, window positions, device actions.
 *  - `useDownloads` -- binary status, downloads, onboarding.
 *
 * The return shape is unchanged from when this was one 900-line hook: every
 * consumer keeps working without modification.
 */
export function useScrcpy() {
    const { config, setConfig, defaultRecordPath, colorMode, setColorMode, historyDevices, addToHistory, clearHistory } = usePersistedConfig();
    const { logs, setLogs, addLogs, clearLogs } = useLogs();

    const {
        devices,
        deviceModels,
        deviceFriendlyNames,
        mdnsDevices,
        activeDevice,
        setActiveDevice,
        isRefreshing,
        refreshDevices,
        refreshDevicesUntilSettled,
        pairDevice,
        connectDevice,
    } = useDevices({ scrcpyPath: config.scrcpyPath, historyDevices, addToHistory, addLogs });

    const {
        runningDevices,
        detectedCameras,
        runScrcpy,
        stopScrcpy,
        recenterMirrorWindow,
        listScrcpyOptions,
        pushFile,
        installApk,
        runTerminalCommand,
    } = useSession({ scrcpyPath: config.scrcpyPath, activeDevice, rememberWindowPosition: config.rememberWindowPosition, addLogs });

    const {
        status,
        isDownloading,
        downloadProgress,
        downloadError,
        scrcpyStatus,
        renderDriverSupport,
        checkScrcpy,
        downloadScrcpy,
        isOnboardingOpen,
        setIsOnboardingOpen,
        completeOnboarding,
    } = useDownloads({ scrcpyPath: config.scrcpyPath, addLogs, onDownloadComplete: refreshDevicesUntilSettled });

    return {
        devices,
        deviceModels,
        deviceFriendlyNames,
        logs,
        setLogs,
        clearLogs,
        isDownloading,
        downloadProgress,
        downloadError,
        status,
        refreshDevices,
        refreshDevicesUntilSettled,
        runScrcpy,
        stopScrcpy,
        recenterMirrorWindow,
        downloadScrcpy,
        activeDevice,
        setActiveDevice,
        checkScrcpy,
        scrcpyStatus,
        pairDevice,
        connectDevice,
        listScrcpyOptions,
        runTerminalCommand,
        runningDevices,
        defaultRecordPath,
        detectedCameras,
        renderDriverSupport,
        isRefreshing,
        mdnsDevices,
        config,
        setConfig,
        colorMode,
        setColorMode,
        pushFile,
        installApk,
        historyDevices,
        clearHistory,
        sessionRunning: runningDevices.includes(activeDevice || ''),
        isOnboardingOpen,
        setIsOnboardingOpen,
        completeOnboarding,
    };
}
