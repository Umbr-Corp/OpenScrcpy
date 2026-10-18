import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useI18n } from '../../i18n';
import { MdnsDevice } from './types';

interface UseDevicesOptions {
    /** Saved scrcpy binary path, used as the fallback for every adb/scrcpy
     *  call that wasn't given an explicit customPath. */
    scrcpyPath?: string;
    historyDevices: string[];
    addToHistory: (ip: string) => void;
    addLogs: (lines: string | string[]) => void;
}

/** The device hub: everything that watches the adb world and reports it back
 *  to the UI -- the connected-device list, per-device labels, mDNS discovery,
 *  the 5s background poll, and the pairing/connect flows that mutate it. */
export function useDevices({ scrcpyPath, historyDevices, addToHistory, addLogs }: UseDevicesOptions) {
    const { t } = useI18n();
    const [devices, setDevices] = useState<string[]>([]);
    // Best-effort, display-only device model per serial (from `adb devices
    // -l`'s own `model:` field). Never used for identity/comparisons -- `d`
    // (the serial) remains the source of truth everywhere else.
    const [deviceModels, setDeviceModels] = useState<Record<string, string>>({});
    // Nicer than deviceModels when available (e.g. "Galaxy S23" instead of
    // "SM S911B"), fetched lazily per device via one extra `adb shell
    // getprop` round-trip -- see the effect below for the once-per-serial
    // cache that keeps this off the 5s background device poll.
    const [deviceFriendlyNames, setDeviceFriendlyNames] = useState<Record<string, string>>({});
    const [activeDevice, setActiveDevice] = useState<string>("");
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [mdnsDevices, setMdnsDevices] = useState<MdnsDevice[]>([]);

    const prevDevicesRef = useRef<string[]>([]);
    const mdnsDevicesRef = useRef<MdnsDevice[]>([]);
    // Serials already queried for a friendly name this session (success or
    // failure) -- guards against re-querying the same device on every 5s
    // background poll. A failed attempt is not retried until the app restarts;
    // the display falls back to deviceModels/the serial in the meantime.
    const fetchedFriendlyNamesRef = useRef<Set<string>>(new Set());

    // Does the actual device + mDNS fetch. Split out from `refreshDevices` so
    // `refreshDevicesUntilSettled` can drive several of these back to back
    // under one continuous "syncing" state, instead of the isRefreshing flag
    // (and the "Syncing..." label bound to it) flickering off and back on
    // between each poll.
    const fetchDevicesOnce = async (customPath?: string, silent: boolean = false) => {
        try {
            const res: any = await invoke('get_devices', { customPath: customPath || scrcpyPath });
            let newDevices: string[] = [];

            if (!res.error) {
                newDevices = res.devices as string[];
                if (res.deviceModels) {
                    setDeviceModels(res.deviceModels as Record<string, string>);
                }
                const prevDevices = prevDevicesRef.current;

                // Identify connections/disconnections
                const added = newDevices.filter(d => !prevDevices.includes(d));
                const removed = prevDevices.filter(d => !newDevices.includes(d));

                added.forEach(device => {
                    addLogs(t('logs.newDeviceDiscovered', { device }));
                });

                removed.forEach(device => {
                    addLogs(t('logs.deviceDisconnected', { device }));
                });

                setDevices(newDevices);
                prevDevicesRef.current = newDevices;

                if (!silent && added.length === 0 && removed.length === 0) {
                    addLogs(t('logs.discoveryActive', { count: newDevices.length }));
                }

                if (newDevices.length > 0 && !activeDevice) {
                    setActiveDevice(newDevices[0]);
                }
            } else if (!silent) {
                addLogs(t('logs.discoveryError', { error: res.message }));
            }

            // Fetch wireless devices broadcasting on the network via mDNS
            try {
                const mdnsRes: any = await invoke('get_mdns_devices', { customPath: customPath || scrcpyPath });
                if (mdnsRes && !mdnsRes.error && mdnsRes.services) {
                    // Keep both service kinds: "_adb-tls-connect" (ready to
                    // connect) and "_adb-tls-pairing" (a device sitting on the
                    // "Pair device with pairing code" screen). The UI routes a
                    // click on either into the pairing modal, code-ready or not.
                    const parsedMdns = (mdnsRes.services as any[]).filter(s => s.service && (s.service.includes('_adb-tls-connect') || s.service.includes('_adb-tls-pairing')));
                    setMdnsDevices(parsedMdns);
                    mdnsDevicesRef.current = parsedMdns;

                    // No client-side auto-connect: adb already reconnects paired
                    // devices it rediscovers over mDNS from its own keystore
                    // (transport_mdns: "Don't try to auto-connect if not in the
                    // keystore"). Once adb reconnects one, get_devices surfaces it
                    // in the hub. Racing it with our own `adb connect` only opened
                    // a duplicate ip:port session for the same device; discovery
                    // here is display-only, plus the pairing modal.
                } else if (mdnsRes && mdnsRes.error) {
                    console.warn("[ADB MDNS] Failed to get mdns devices:", mdnsRes.message);
                    setMdnsDevices([]);
                    mdnsDevicesRef.current = [];
                }
            } catch (mdnsErr) {
                console.error("Failed to query mDNS devices:", mdnsErr);
            }
        } catch (e) {
            console.error(e);
            addLogs(t('logs.errorRefreshingDevices', { error: String(e) }));
        }
    };

    const refreshDevices = async (customPath?: string, silent: boolean = false) => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            await fetchDevicesOnce(customPath, silent);
        } finally {
            setIsRefreshing(false);
        }
    };

    // adb reconnects a known device from its own keystore once it resolves it
    // again over mDNS, but that isn't instant -- right after this app starts
    // (especially right after an `adb kill-server`, where adb's own mDNS scan
    // hasn't found anything yet either) or right after pairing succeeds, a
    // single refresh can still miss it entirely: the very first pass can come
    // back with no mDNS record at all, not just an unconnected one, so
    // waiting only for a *known* unconnected device would already be too
    // late to start watching. Instead, keep refreshing until two consecutive
    // reads agree (devices and mDNS entries both unchanged) -- that catches
    // the mDNS scan lagging behind, the reconnect handshake lagging behind
    // that, or nothing happening at all (which just settles immediately).
    //
    // isRefreshing (and the "Syncing..." label bound to it) is held for the
    // whole poll, not just each individual pass -- otherwise it flips back to
    // "Refresh" between polls while still silently waiting, then a device can
    // pop into the hub several seconds after the button already looks idle.
    const refreshDevicesUntilSettled = async (customPath?: string, attempts: number = 8, delayMs: number = 2000) => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        try {
            let prevSnapshot = '';
            for (let i = 0; i <= attempts; i++) {
                await fetchDevicesOnce(customPath, true);
                const snapshot = JSON.stringify([prevDevicesRef.current, mdnsDevicesRef.current]);
                if (snapshot === prevSnapshot) return;
                prevSnapshot = snapshot;
                if (i < attempts) await new Promise(r => setTimeout(r, delayMs));
            }
        } finally {
            setIsRefreshing(false);
        }
    };

    // Refs so the interval below always calls the latest closures without
    // being torn down and recreated every render (which would reset its
    // timing and, more subtly, could stack overlapping adb calls).
    const isRefreshingRef = useRef(isRefreshing);
    useEffect(() => { isRefreshingRef.current = isRefreshing; }, [isRefreshing]);
    const fetchDevicesOnceRef = useRef(fetchDevicesOnce);
    useEffect(() => { fetchDevicesOnceRef.current = fetchDevicesOnce; });

    // Keep the hub in sync on its own so a device pairing, reconnecting, or
    // dropping off doesn't require a manual refresh to notice. This calls
    // fetchDevicesOnce() directly rather than refreshDevices(), so it never
    // toggles isRefreshing (no "Syncing..." flicker or buttons disabling
    // every few seconds) and never fires while a manual refresh or the
    // settle-poll above is already in flight. It also pauses while the
    // window is hidden, since there's nothing to update on screen anyway.
    useEffect(() => {
        const interval = setInterval(() => {
            if (document.visibilityState === 'hidden' || isRefreshingRef.current) return;
            fetchDevicesOnceRef.current(undefined, true);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    // Upgrade each device's label to its marketing name (e.g. "Galaxy S23"),
    // one extra `adb shell getprop` round-trip per *newly seen* serial only --
    // fetchedFriendlyNamesRef is what keeps this off the 5s poll above, since
    // `devices` is a new array reference on every poll tick even when its
    // contents haven't changed.
    useEffect(() => {
        devices.forEach(async (serial) => {
            if (fetchedFriendlyNamesRef.current.has(serial)) return;
            fetchedFriendlyNamesRef.current.add(serial);

            // Emulators (Android Studio AVDs, "emulator-5554") never have a
            // meaningful marketname or manufacturer, and ro.product.model is
            // a generic SDK build string (e.g. "sdk_gphone64_x86_64") --
            // uglier than the plain serial adb already assigns. Look up the
            // AVD's own configured name instead; if that's unavailable too,
            // explicitly keep the serial so it doesn't fall through to that
            // uglier model string via deviceModels.
            const isEmulator = /^emulator-\d+$/.test(serial);

            try {
                const command = isEmulator
                    ? 'getprop ro.boot.qemu.avd_name; getprop ro.kernel.qemu.avd_name'
                    : 'getprop ro.product.marketname; getprop ro.product.manufacturer; getprop ro.product.model';
                const res: any = await invoke('adb_shell', { device: serial, command, customPath: scrcpyPath });

                if (isEmulator) {
                    const avdName = res?.success
                        ? (res.output as string).split('\n').map(line => line.trim()).find(line => line.length > 0)
                        : undefined;
                    // Keep the serial visible alongside the AVD name: several
                    // emulator instances of the same AVD image running at
                    // once would otherwise show up as indistinguishable
                    // identical labels in the hub.
                    setDeviceFriendlyNames(prev => ({
                        ...prev,
                        [serial]: avdName ? `${avdName.replace(/_/g, ' ')} (${serial})` : serial
                    }));
                    return;
                }

                if (res?.success) {
                    const [marketname, manufacturer, model] = (res.output as string)
                        .split('\n')
                        .map(line => line.trim());
                    // Most devices never set marketname (it's not a universal
                    // property -- scrcpy's own device log falls back to the
                    // same manufacturer+model combo for exactly this reason,
                    // e.g. "[OPPO] OPPO CPH2697"). Avoid a doubled-up name
                    // when the model already starts with the manufacturer.
                    const name = marketname ||
                        (manufacturer && model && !model.toLowerCase().startsWith(manufacturer.toLowerCase())
                            ? `${manufacturer} ${model}`
                            : model);
                    if (name) {
                        setDeviceFriendlyNames(prev => ({ ...prev, [serial]: name }));
                    }
                }
            } catch (e) {
                console.error("Failed to fetch friendly name for", serial, e);
            }
        });
    }, [devices, scrcpyPath]);

    // Legacy ADB-over-network devices (a plain ip:port from the manual "IP
    // Connect" field, e.g. an Android TV/set-top box on `adb tcpip`) have no
    // persistent trust the way wireless debugging's TLS pairing does -- adb
    // doesn't remember them at all once its server restarts or the
    // connection drops, so nothing reconnects them the way a paired phone
    // reconnects on its own over mDNS. Retry anything already in "Recent
    // Devices" but not currently in the hub, quietly, once on mount and then
    // every 25s. Unlike the removed client-side auto-connect, this only ever
    // targets addresses the user has already connected to themselves before,
    // never anything freshly discovered -- and it calls adb_connect directly
    // rather than through connectDevice(), so a device that's simply offline
    // doesn't spam the log with a failure every 25 seconds; a successful
    // reconnect still surfaces normally through the next device-list poll.
    useEffect(() => {
        const tryReconnectHistory = () => {
            if (document.visibilityState === 'hidden') return;
            historyDevices.forEach(ip => {
                if (!prevDevicesRef.current.includes(ip)) {
                    invoke('adb_connect', { ip, customPath: scrcpyPath, silent: true }).catch(() => { });
                }
            });
        };
        tryReconnectHistory();
        const interval = setInterval(tryReconnectHistory, 25000);
        return () => clearInterval(interval);
    }, [historyDevices, scrcpyPath]);

    const pairDevice = async (ip: string, code: string, customPath?: string) => {
        try {
            const res: any = await invoke('adb_pair', { ip, code, customPath: customPath || scrcpyPath });
            if (res.success) {
                addLogs(t('logs.successfullyPaired', { ip }));
                await refreshDevicesUntilSettled(customPath);
            } else {
                const msgs = [t('logs.pairingFailed', { message: String(res.message) })];
                if (typeof res.message === 'string' && res.message.includes('protocol fault')) {
                    msgs.push(t('logs.pairingProtocolFault'));
                }
                addLogs(msgs);
            }
            return res;
        } catch (e: any) {
            addLogs(t('logs.pairingError', { error: String(e) }));
            return { success: false, message: e };
        }
    };

    const connectDevice = async (ip: string, customPath?: string) => {
        setIsRefreshing(true);
        try {
            // Normalize a bare IP ("192.168.0.12"): adb falls back to port 5555
            // on its own, so the connect succeeds either way -- but the history
            // entry and the disconnect-retry below both key on "ip:port", and a
            // bare IP would connect silently yet never land in Recent Devices.
            const target = ip.includes(':') ? ip : `${ip}:5555`;

            // Attempt 1: Connect
            let res: any = await invoke('adb_connect', { ip: target, customPath: customPath || scrcpyPath });

            // Retry Logic: If failed, try to disconnect first then reconnect
            if (!res.success && typeof res.message === 'string' && (res.message.includes('failed to connect') || res.message.includes('cannot connect'))) {
                addLogs(t('logs.connectionFailedRetrying'));
                // Force disconnect to clear ghost state
                await invoke('run_terminal_command', { cmd: `adb disconnect ${target}`, customPath: customPath || scrcpyPath });
                // Small delay
                await new Promise(r => setTimeout(r, 500));
                // Attempt 2
                res = await invoke('adb_connect', { ip: target, customPath: customPath || scrcpyPath });
            }

            if (res.success) {
                addLogs(t('logs.connectedSuccessfully', { ip: target }));
                addToHistory(target);

                // Allow ADB to settle and state to update
                await new Promise(r => setTimeout(r, 1000));

                setIsRefreshing(false); // Enable refreshDevices to run
                await refreshDevices(customPath || scrcpyPath, true);
            } else {
                const msgs = [t('logs.connectionFailed', { message: String(res.message) })];
                // Smart tip for stale ports
                if (typeof res.message === 'string' && (res.message.includes('failed to connect') || res.message.includes('cannot connect'))) {
                    msgs.push(t('logs.connectionStaleTip'));
                }
                addLogs(msgs);
            }
            return res;
        } catch (e: any) {
            addLogs(t('logs.connectionError', { error: String(e) }));
            return { success: false, message: e };
        } finally {
            setIsRefreshing(false);
        }
    };

    return {
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
    };
}
