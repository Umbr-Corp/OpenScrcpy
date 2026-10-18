import React from 'react';
import { Smartphone, RefreshCw, Usb, Wifi, UploadCloud, Zap, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { MdnsDevice, isMdnsDeviceConnected, mdnsHostIp } from '../hooks/useScrcpy';
import Modal from './Modal';

// mDNS wireless-debugging serials look like
// "adb-<serial>-<random>._adb-tls-connect._tcp" (optionally with an mDNS
// conflict suffix, e.g. "... (2)._adb-tls-connect._tcp"). That is the real adb
// serial (still needed for -s), just unreadable as a label, so strip the mDNS
// protocol boilerplate for display only.
function formatDeviceLabel(serial: string): string {
    const match = serial.match(/^adb-(.+?)( \(\d+\))?\._adb-tls-connect\._(tcp|udp)$/);
    return match ? `${match[1]}${match[2] ?? ''}` : serial;
}

// An mDNS instance name like "adb-VWGE5XZHOBAIAAJN-thoiAU" is long and the
// "adb-" prefix adds nothing readable as a secondary label next to the
// address; strip it for display only.
function formatMdnsName(name: string): string {
    return name.replace(/^adb-/, '');
}

export interface SidebarProps {
    devices: string[];
    // Best-effort, display-only device model per serial; falls back to
    // formatDeviceLabel(d) when a serial has no known model yet.
    deviceModels?: Record<string, string>;
    // Nicer marketing name per serial when available (e.g. "Galaxy S23"),
    // fetched lazily; preferred over deviceModels when present.
    deviceFriendlyNames?: Record<string, string>;
    runningDevices: string[];
    onRefresh: () => void;
    onKillAdb: () => void;
    selectedDevice: string;
    onSelectDevice: (d: string) => void;
    onPair: (ip: string, code: string) => Promise<any>;
    onConnect: (ip: string) => Promise<any>;
    // One-click USB -> wireless switch (only shown while the hub card has a
    // USB transport and no wireless one yet).
    onGotoWireless?: (device: string) => void;
    wirelessSwitching?: string | null;
    isRefreshing?: boolean;
    onFilePush: () => void;
    // History props
    historyDevices?: string[];
    clearHistory?: () => void;
    mdnsDevices?: MdnsDevice[];
}

export default function Sidebar({
    devices,
    deviceModels = {},
    deviceFriendlyNames = {},
    runningDevices,
    onRefresh,
    onKillAdb,
    selectedDevice,
    onSelectDevice,
    onPair,
    onConnect,
    onGotoWireless,
    wirelessSwitching = null,
    isRefreshing,
    onFilePush,
    historyDevices = [],
    clearHistory = () => { },
    mdnsDevices = []
}: SidebarProps) {
    const { t } = useI18n();
    const [activeTab, setActiveTab] = React.useState<'usb' | 'wireless'>('usb');
    const [connectIp, setConnectIp] = React.useState('');
    const [pairIp, setPairIp] = React.useState('');
    const [pairCode, setPairCode] = React.useState('');
    const pairCodeRef = React.useRef<HTMLInputElement>(null);
    // Code input inside the pairing modal; focused when the dialog opens.
    const modalCodeRef = React.useRef<HTMLInputElement>(null);

    // Tapping a discovered device opens this instead of attempting a doomed
    // `adb connect`: a device that shows up here but isn't in the hub above
    // isn't paired with this PC yet (a paired one reconnects on its own), so
    // connecting can't succeed before pairing.
    const [pairingTarget, setPairingTarget] = React.useState<MdnsDevice | null>(null);
    const [modalCode, setModalCode] = React.useState('');
    const [modalError, setModalError] = React.useState(false);
    const [modalSubmitting, setModalSubmitting] = React.useState(false);

    const handleConnect = async (ip: string) => {
        if (!ip) return;
        await onConnect(ip);
    };

    // The same physical phone broadcasts "_adb-tls-connect" (wireless
    // debugging is on) and, while it sits on the pairing screen,
    // "_adb-tls-pairing" at once -- two separate mDNS records for one device,
    // with instance names that differ in their random per-record suffix.
    // Collapse them by host IP, keeping the pairing record when both are
    // present since that's the one actually actionable right now.
    const uniqueMdnsDevices = React.useMemo(() => {
        const byHost = new Map<string, MdnsDevice>();
        for (const dev of mdnsDevices) {
            const key = mdnsHostIp(dev.address);
            const existing = byHost.get(key);
            const devIsPairing = dev.service.includes('_adb-tls-pairing');
            const existingIsPairing = existing?.service.includes('_adb-tls-pairing') ?? false;
            if (!existing || (devIsPairing && !existingIsPairing)) {
                byHost.set(key, dev);
            }
        }
        return Array.from(byHost.values());
    }, [mdnsDevices]);

    // One card per physical device: adb lists the USB and Wi-Fi transports
    // separately, so a phone that went wireless while plugged in appears
    // twice (same SM-A055M, two entries). Group every transport id under its
    // friendly/model name; the chips carry the individual transports and the
    // card click falls back to the first available id.
    const deviceGroups = React.useMemo(() => {
        const groups = new Map<string, { name: string; ids: string[] }>();
        for (const d of devices) {
            const name = deviceFriendlyNames[d] || deviceModels[d] || formatDeviceLabel(d);
            const g = groups.get(name);
            if (g) g.ids.push(d);
            else groups.set(name, { name, ids: [d] });
        }
        return Array.from(groups.values());
    }, [devices, deviceModels, deviceFriendlyNames]);

    // Shared by the manual pairing form and the discovered-device modal.
    // `onPair` already refreshes the device list on success, and a paired
    // device reconnects on its own from there (adb reconnects it natively from
    // its keystore over mDNS). Explicitly connecting here too -- as this used
    // to, to work around the old hardcoded ip:5555 -- raced that native
    // reconnect and opened a second, duplicate session for the same device
    // under a stale ip:port.
    const completePairing = async (ip: string, code: string) => onPair(ip, code);

    const submitPairingModal = async () => {
        if (!pairingTarget || !modalCode || modalSubmitting) return;
        setModalSubmitting(true);
        setModalError(false);
        const res = await completePairing(pairingTarget.address, modalCode);
        setModalSubmitting(false);
        if (res.success) {
            setPairingTarget(null);
            setModalCode('');
        } else {
            setModalError(true);
        }
    };

    // While the modal is waiting on the phone's pairing screen to open, keep
    // refreshing in the background so it can pick up the "_adb-tls-pairing"
    // broadcast the moment it appears, without the user needing to close the
    // modal, do the manual step, then reopen it.
    React.useEffect(() => {
        if (!pairingTarget || pairingTarget.service.includes('_adb-tls-pairing')) return;
        const interval = setInterval(onRefresh, 2000);
        return () => clearInterval(interval);
    }, [pairingTarget, onRefresh]);

    // The instant a matching pairing broadcast shows up, swap the modal
    // straight to the code field -- same modal, no reopening needed. Match by
    // host IP: the record names differ per suffix (see uniqueMdnsDevices).
    React.useEffect(() => {
        if (!pairingTarget || pairingTarget.service.includes('_adb-tls-pairing')) return;
        const targetIp = mdnsHostIp(pairingTarget.address);
        const ready = uniqueMdnsDevices.find(d =>
            d.service.includes('_adb-tls-pairing') && mdnsHostIp(d.address) === targetIp
        );
        if (ready) setPairingTarget(ready);
    }, [uniqueMdnsDevices, pairingTarget]);

    return (
        <>
        <aside className="lg:col-span-3 space-y-4">
            <div className="ds-card p-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2 pb-2 mb-1" style={{ borderBottom: '1px solid var(--border-base)' }}>
                    <h2 className="ds-label flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
                        <Smartphone size={14} style={{ color: 'var(--primary)' }} />
                        {t('sidebar.deviceHub')}
                    </h2>
                    <div className="flex gap-2 items-center ml-auto">
                        <button
                            onClick={onKillAdb}
                            className="ds-btn ds-btn-tertiary"
                            title={t('sidebar.killAdbTitle')}
                        >
                            <Zap size={10} />
                            {t('sidebar.killAdb')}
                        </button>
                        <button
                            onClick={onRefresh}
                            disabled={isRefreshing}
                            className="ds-btn ds-btn-tertiary"
                        >
                            <RefreshCw size={10} className={isRefreshing ? 'animate-spin' : ''} />
                            {isRefreshing ? t('sidebar.syncing') : t('sidebar.refresh')}
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                        {devices.length === 0 ? (
                            <div className="ds-panel p-4 text-center" style={{ borderStyle: 'dashed' }}>
                                <span className="ds-caption" style={{ color: 'var(--text-muted)' }}>{t('sidebar.noDevicesDetected')}</span>
                            </div>
                        ) : (
                            deviceGroups.map(g => {
                                const ids = g.ids;
                                const primary = ids[0];
                                const isRunning = runningDevices.some(r => ids.includes(r));
                                const isSelected = selectedDevice != null && ids.includes(selectedDevice);
                                const usbId = ids.find(id => !id.includes('.'));
                                const hasWireless = ids.some(id => id.includes('.'));
                                const switching = wirelessSwitching != null && ids.includes(wirelessSwitching);
                                return (
                                    <button
                                        key={primary}
                                        onClick={() => onSelectDevice(primary)}
                                        aria-pressed={isSelected}
                                        className="ds-panel flex items-center gap-2 p-2 text-left w-full"
                                        style={isSelected ? { borderColor: 'var(--primary)' } : undefined}
                                    >
                                        <div className="ds-inset p-1.5 flex items-center justify-center shrink-0">
                                            <Smartphone size={14} style={{ color: isSelected ? 'var(--primary)' : 'var(--text-muted)' }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="ds-label truncate">{g.name}</p>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                <span className="flex items-center gap-1">
                                                    <span className="ds-dot" data-live={isRunning} />
                                                    <span className="ds-badge" data-live={isRunning}>
                                                        {isRunning ? t('sidebar.live') : t('sidebar.ready')}
                                                    </span>
                                                </span>
                                                {ids.map(id => id.includes('.') ? (
                                                    <span
                                                        key={id}
                                                        role="button"
                                                        aria-label={`${t('sidebar.wifi')}: ${id}`}
                                                        className="ds-badge cursor-pointer"
                                                        style={selectedDevice === id ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : undefined}
                                                        onClick={(e) => { e.stopPropagation(); onSelectDevice(id); }}
                                                    >
                                                        <Wifi size={8} />
                                                        {t('sidebar.wifi')}
                                                    </span>
                                                ) : (
                                                    <span
                                                        key={id}
                                                        role="button"
                                                        aria-label={`${t('sidebar.usb')}: ${id}`}
                                                        className="ds-badge cursor-pointer"
                                                        style={selectedDevice === id ? { borderColor: 'var(--primary)', color: 'var(--primary)' } : undefined}
                                                        onClick={(e) => { e.stopPropagation(); onSelectDevice(id); }}
                                                    >
                                                        <Usb size={8} />
                                                        {t('sidebar.usb')}
                                                    </span>
                                                ))}
                                                {usbId && !hasWireless && onGotoWireless && (
                                                    <button
                                                        type="button"
                                                        disabled={wirelessSwitching != null}
                                                        onClick={(e) => { e.stopPropagation(); onGotoWireless(usbId); }}
                                                        className="ds-btn ds-btn-tertiary w-full mt-1"
                                                        style={{ padding: '4px 8px', fontSize: 11.5, gap: 6 }}
                                                    >
                                                        <Wifi size={11} />
                                                        {switching ? t('sidebar.switching') : t('sidebar.gotoWireless')}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <div className="ds-tabs" role="tablist" aria-label={t('sidebar.deviceHub')}>
                        <button
                            role="tab"
                            aria-selected={activeTab === 'usb'}
                            data-active={activeTab === 'usb'}
                            onClick={() => setActiveTab('usb')}
                            className="ds-tab"
                        >
                            <Usb size={11} /> {t('sidebar.usb')}
                        </button>
                        <button
                            role="tab"
                            aria-selected={activeTab === 'wireless'}
                            data-active={activeTab === 'wireless'}
                            onClick={() => setActiveTab('wireless')}
                            className="ds-tab"
                        >
                            <Wifi size={11} /> {t('sidebar.wireless')}
                        </button>
                    </div>

                    {activeTab === 'usb' && (
                        <div className="pt-1">
                            <div className="ds-panel p-3 space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="ds-dot" data-live="false" />
                                    <span className="ds-label">{t('sidebar.usbSetupTip')}</span>
                                </div>
                                <p className="ds-caption" style={{ color: 'var(--text-muted)' }}>
                                    {t('sidebar.usbSetupTipTextBefore')} <span className="ds-strong" style={{ color: 'var(--text-base)' }}>{t('sidebar.usbSetupTipDeveloperOptions')}</span> {t('sidebar.usbSetupTipAnd')} <span className="ds-strong" style={{ color: 'var(--text-base)' }}>{t('sidebar.usbSetupTipUsbDebugging')}</span> {t('sidebar.usbSetupTipTextAfter')}
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'wireless' && (
                        <div className="space-y-5 pt-2">
                            <div className="ds-panel p-3 space-y-1.5">
                                <div className="flex items-center gap-2">
                                    <span className="ds-dot" data-live="false" />
                                    <span className="ds-label">{t('sidebar.wirelessSetupTip')}</span>
                                </div>
                                <p className="ds-caption" style={{ color: 'var(--text-muted)' }}>
                                    {t('sidebar.wirelessSetupTipTextBefore')} <span className="ds-strong" style={{ color: 'var(--text-base)' }}>{t('sidebar.wirelessSetupTipSameWifi')}</span> {t('sidebar.wirelessSetupTipAnd')} <span className="ds-strong" style={{ color: 'var(--text-base)' }}>{t('sidebar.wirelessSetupTipWirelessDebugging')}</span>{t('sidebar.wirelessSetupTipTextAfter')}
                                </p>
                            </div>
                            <div className="space-y-3">
                                <div className="pb-1.5" style={{ borderBottom: '1px solid var(--border-base)' }}>
                                    <label className="ds-label" htmlFor="sidebar-connect-ip">{t('sidebar.ipConnect')}</label>
                                </div>

                                <div className="flex gap-2">
                                    <div className="relative flex-1 flex items-center gap-2">
                                        <Wifi size={10} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                                        <input
                                            id="sidebar-connect-ip"
                                            type="text"
                                            placeholder={t('sidebar.ipPlaceholder')}
                                            value={connectIp}
                                            onChange={(e) => setConnectIp(e.target.value)}
                                            className="ds-input w-full"
                                        />
                                    </div>
                                    <button
                                        onClick={() => handleConnect(connectIp)}
                                        disabled={isRefreshing}
                                        className="ds-btn ds-btn-secondary"
                                    >
                                        {isRefreshing ? t('sidebar.connecting') : t('sidebar.connect')}
                                    </button>
                                </div>

                            </div>

                            {/* Discovered Devices (mDNS) */}
                            {uniqueMdnsDevices.filter(dev => !isMdnsDeviceConnected(dev, devices)).length > 0 && (
                                <div className="space-y-3 pt-1">
                                    <div className="flex items-center justify-between pb-1.5" style={{ borderBottom: '1px solid var(--border-base)' }}>
                                        <span className="ds-label">{t('sidebar.discoveredDevices')}</span>
                                    </div>
                                    <p className="ds-caption" style={{ color: 'var(--text-muted)' }}>{t('sidebar.discoveredHint')}</p>
                                    <div className="space-y-2">
                                        {uniqueMdnsDevices
                                            .filter(dev => !isMdnsDeviceConnected(dev, devices))
                                            .map(dev => (
                                                <button
                                                    key={dev.name}
                                                    disabled={isRefreshing}
                                                    onClick={() => {
                                                        setPairingTarget(dev);
                                                        setModalCode('');
                                                        setModalError(false);
                                                    }}
                                                    className="ds-panel w-full flex items-center justify-between p-2 text-left"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Wifi size={10} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                                                        <span className="ds-label truncate" title={`${dev.address} (${formatMdnsName(dev.name)})`}>
                                                            {dev.address} ({formatMdnsName(dev.name)})
                                                        </span>
                                                    </div>
                                                    <span className="ds-caption shrink-0 ml-2" style={{ color: 'var(--primary)' }}>
                                                        {t('sidebar.startPairing')}
                                                    </span>
                                                </button>
                                            ))}
                                    </div>
                                </div>
                            )}

                            {/* Recent Devices History */}
                            {historyDevices.length > 0 && (
                                <div className="space-y-3 pt-1">
                                    <div className="flex items-center justify-between pb-1.5" style={{ borderBottom: '1px solid var(--border-base)' }}>
                                        <span className="ds-label">{t('sidebar.recentDevices')}</span>
                                        <button
                                            onClick={clearHistory}
                                            className="ds-btn ds-btn-tertiary"
                                        >
                                            {t('sidebar.clear')}
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {historyDevices.map(ip => (
                                            <button
                                                key={ip}
                                                disabled={isRefreshing}
                                                onClick={() => {
                                                    setConnectIp(ip);
                                                    handleConnect(ip);
                                                }}
                                                className="ds-panel w-full flex items-center justify-between p-2"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <Wifi size={10} style={{ color: 'var(--text-muted)' }} />
                                                    <span className="ds-label">{ip}</span>
                                                </span>
                                                <span className="ds-caption" style={{ color: 'var(--primary)' }}>
                                                    {t('sidebar.connect')}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Pairing Setup */}
                            <div className="space-y-3 pt-1">
                                <div className="pb-1.5" style={{ borderBottom: '1px solid var(--border-base)' }}>
                                    <span className="ds-label">{t('sidebar.pairDeviceTitle')}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="ds-caption" htmlFor="sidebar-pair-ip" style={{ color: 'var(--text-muted)' }}>
                                            {t('sidebar.ipPortPlaceholder')}
                                        </label>
                                        <input
                                            id="sidebar-pair-ip"
                                            type="text"
                                            placeholder={t('sidebar.ipPortPlaceholder')}
                                            value={pairIp}
                                            onChange={(e) => setPairIp(e.target.value)}
                                            className="ds-input w-full"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="ds-caption" htmlFor="sidebar-pair-code" style={{ color: 'var(--text-muted)' }}>
                                            {t('sidebar.pairingCodePlaceholder')}
                                        </label>
                                        <input
                                            id="sidebar-pair-code"
                                            ref={pairCodeRef}
                                            type="text"
                                            placeholder={t('sidebar.pairingCodePlaceholder')}
                                            value={pairCode}
                                            onChange={(e) => setPairCode(e.target.value)}
                                            className="ds-input w-full"
                                            style={pairIp ? { borderStyle: 'dashed' } : undefined}
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={async () => {
                                        if (!pairIp || !pairCode || isRefreshing) return;
                                        const res = await completePairing(pairIp, pairCode);
                                        if (res.success) setPairCode('');
                                    }}
                                    disabled={isRefreshing}
                                    className="ds-btn ds-btn-primary w-full"
                                >
                                    {isRefreshing ? t('sidebar.synchronizing') : t('sidebar.startPairing')}
                                </button>
                            </div>

                        </div>
                    )}
                </div>
            </div>

            <div
                onClick={onFilePush}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFilePush(); } }}
                role="button"
                tabIndex={0}
                aria-label={t('sidebar.flashPushFiles')}
                className="ds-panel p-5 flex flex-col items-center justify-center gap-2 cursor-pointer"
                style={{ borderStyle: 'dashed' }}
            >
                <div className="ds-inset p-3 rounded-full flex items-center justify-center">
                    <UploadCloud size={24} style={{ color: 'var(--text-muted)' }} />
                </div>
                <div className="text-center">
                    <h3 className="ds-label">{t('sidebar.flashPushFiles')}</h3>
                    <p className="ds-caption mt-1" style={{ color: 'var(--text-muted)' }}>{t('sidebar.flashPushSubtitle')}</p>
                </div>
            </div>
        </aside>

        {pairingTarget && (
            <Modal
                isOpen
                onClose={() => setPairingTarget(null)}
                label={pairingTarget.service.includes('_adb-tls-pairing') ? t('sidebar.pairModalTitle') : t('sidebar.pairModalNotReadyTitle')}
                overlayClassName="p-6"
                panelClassName="w-full max-w-sm p-6"
                initialFocusRef={modalCodeRef}
            >
                    <button
                        onClick={() => setPairingTarget(null)}
                        aria-label={t('common.cancel')}
                        className="ds-btn ds-btn-tertiary absolute top-4 right-4"
                    >
                        <X size={18} />
                    </button>
                    {pairingTarget.service.includes('_adb-tls-pairing') ? (
                        <>
                            <h3 className="ds-body ds-strong mb-1 pr-6">{t('sidebar.pairModalTitle')}</h3>
                            <p className="ds-caption truncate mb-4" style={{ color: 'var(--text-muted)' }}>{pairingTarget.address} ({formatMdnsName(pairingTarget.name)})</p>
                            <label className="ds-label block mb-1" htmlFor="sidebar-modal-code">
                                {t('sidebar.pairingCodePlaceholder')}
                            </label>
                            <input
                                id="sidebar-modal-code"
                                ref={modalCodeRef}
                                type="text"
                                placeholder={t('sidebar.pairingCodePlaceholder')}
                                value={modalCode}
                                onChange={(e) => { setModalCode(e.target.value); setModalError(false); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') submitPairingModal(); }}
                                className="ds-input w-full mb-2"
                            />
                            {modalError && (
                                <p className="ds-badge mb-2" style={{ borderStyle: 'dashed' }}>{t('sidebar.pairModalError')}</p>
                            )}
                            <button
                                onClick={submitPairingModal}
                                disabled={!modalCode || modalSubmitting}
                                className="ds-btn ds-btn-primary w-full"
                            >
                                {modalSubmitting ? t('sidebar.synchronizing') : t('common.ok')}
                            </button>
                        </>
                    ) : (
                        <>
                            <h3 className="ds-body ds-strong mb-1 pr-6">{t('sidebar.pairModalNotReadyTitle')}</h3>
                            <p className="ds-caption truncate mb-4" style={{ color: 'var(--text-muted)' }}>{pairingTarget.address} ({formatMdnsName(pairingTarget.name)})</p>
                            <p className="ds-caption mb-4" style={{ color: 'var(--text-secondary)' }}>{t('sidebar.pairModalNotReadyBody')}</p>
                            <div className="flex items-center justify-center gap-2 mb-4" style={{ color: 'var(--text-muted)' }}>
                                <RefreshCw size={12} className="animate-spin" />
                                <span className="ds-label">{t('sidebar.pairModalWaiting')}</span>
                            </div>
                            <button
                                onClick={() => setPairingTarget(null)}
                                className="ds-btn ds-btn-secondary w-full"
                            >
                                {t('common.cancel')}
                            </button>
                        </>
                    )}
            </Modal>
        )}
        </>
    );
}
