import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useI18n } from '../../i18n';
import { isTauri } from '../../tauri';
import { RenderDriverSupport } from './types';

interface UseDownloadsOptions {
    /** Saved scrcpy binary path, used as the fallback when checkScrcpy isn't
     *  given an explicit customPath. */
    scrcpyPath?: string;
    addLogs: (lines: string | string[]) => void;
    /** Called on download-complete with the backend message -- wired by the
     *  composition root to the device hub's settle-poll, since adb may only
     *  have appeared as a result of this download. */
    onDownloadComplete: (message: string) => void;
}

/** Binary status + downloads + first-run onboarding: whether the scrcpy
 *  bundle (adb + scrcpy) is found, the automatic download flow, and the
 *  onboarding modal that goes with a missing bundle. */
export function useDownloads({ scrcpyPath, addLogs, onDownloadComplete }: UseDownloadsOptions) {
    const { t } = useI18n();
    const [status, setStatus] = useState<string>("");
    const [downloadProgress, setDownloadProgress] = useState<number>(0);
    const [isDownloading, setIsDownloading] = useState(false);
    const [scrcpyStatus, setScrcpyStatus] = useState<{ found: boolean, message: string }>({ found: false, message: t('common.loading') });
    const [renderDriverSupport, setRenderDriverSupport] = useState<RenderDriverSupport>({
        hostOs: 'unknown',
        supportsRenderDriver: false,
        supportedDrivers: []
    });
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);

    // Ref so the download-complete handler below always calls the *latest*
    // checkScrcpy (which falls back to the current saved scrcpyPath) even
    // though the listener itself only subscribes once on mount.
    const checkScrcpyRef = useRef<(customPath?: string) => Promise<boolean>>(async () => false);

    useEffect(() => {
        // No backend event source outside the Tauri WebView.
        if (!isTauri()) return;

        const unlistenStatus = listen<any>('scrcpy-status', (event) => {
            const data = event.payload;
            if (data.type === 'downloading') {
                setIsDownloading(true);
                setStatus(data.message);
            } else if (data.type === 'download-progress') {
                setDownloadProgress(data.percent);
            } else if (data.type === 'download-complete') {
                setIsDownloading(false);
                setStatus(t('logs.downloadComplete'));
                // adb didn't exist at all until this just finished, so the
                // settle-poll from mount had nothing to find yet and gave up
                // early -- this is the first real chance to detect anything,
                // and a single refresh can still miss a device that's mid
                // reconnect, same as at mount or right after pairing.
                onDownloadComplete(data.message);
                checkScrcpyRef.current(); // Re-check binary status
            }
        });

        return () => {
            unlistenStatus.then(f => f());
        };
    }, []);

    const downloadScrcpy = async () => {
        try {
            setIsDownloading(true);
            await invoke('download_scrcpy');
        } catch (e: any) {
            setIsDownloading(false);
            addLogs(t('logs.downloadError', { error: String(e) }));
        }
    };

    const checkScrcpy = async (customPath?: string) => {
        try {
            // If customPath is explicitly provided (even as undefined/null for reset), use it.
            // Otherwise, use the saved path from config.
            const pathToCheck = customPath !== undefined ? customPath : scrcpyPath;
            const res: any = await invoke('check_scrcpy', { customPath: pathToCheck });
            setScrcpyStatus(res);

            if (res.found) {
                try {
                    const renderRes: any = await invoke('get_render_drivers', { customPath: pathToCheck });
                    setRenderDriverSupport({
                        hostOs: renderRes?.hostOs || 'unknown',
                        supportsRenderDriver: !!renderRes?.supportsRenderDriver,
                        supportedDrivers: Array.isArray(renderRes?.supportedDrivers) ? renderRes.supportedDrivers : []
                    });
                } catch {
                    setRenderDriverSupport({
                        hostOs: 'unknown',
                        supportsRenderDriver: false,
                        supportedDrivers: []
                    });
                }
            } else {
                setRenderDriverSupport({
                    hostOs: 'unknown',
                    supportsRenderDriver: false,
                    supportedDrivers: []
                });
            }

            // Auto-trigger onboarding if not found
            if (!res.found) {
                setIsOnboardingOpen(true);
            }

            return res.found;
        } catch (e: any) {
            setScrcpyStatus({ found: false, message: t('logs.genericError', { error: String(e) }) });
            return false;
        }
    };

    // Keep the ref pointing at the latest checkScrcpy closure.
    checkScrcpyRef.current = checkScrcpy;

    const completeOnboarding = () => {
        localStorage.setItem('scrcpy_onboarding_done', 'true');
        setIsOnboardingOpen(false);
    };

    return {
        status,
        downloadProgress,
        isDownloading,
        scrcpyStatus,
        renderDriverSupport,
        checkScrcpy,
        downloadScrcpy,
        isOnboardingOpen,
        setIsOnboardingOpen,
        completeOnboarding,
    };
}
