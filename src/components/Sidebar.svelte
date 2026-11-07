<script lang="ts">
    import { AlertTriangle, Smartphone, RefreshCw, Usb, Wifi, UploadCloud, Zap } from '@lucide/svelte';
    import { t } from '../i18n';
    import { scrcpy } from '../lib/scrcpy.svelte';
    import { isMdnsDeviceConnected, mdnsHostIp, type MdnsDevice } from '../lib/types';
    import SheetModal from './SheetModal.svelte';

    function formatDeviceLabel(serial: string): string {
        const match = serial.match(/^adb-(.+?)( \(\d+\))?\._adb-tls-connect\._(tcp|udp)$/);
        return match ? `${match[1]}${match[2] ?? ''}` : serial;
    }

    function formatMdnsName(name: string): string {
        return name.replace(/^adb-/, '');
    }

    let activeTab = $state<'usb' | 'wireless'>('usb');
    let connectIp = $state('');
    let pairIp = $state('');
    let pairCode = $state('');
    let pairingTarget = $state<MdnsDevice | null>(null);
    let modalCode = $state('');
    let modalError = $state(false);
    let modalSubmitting = $state(false);

    const devices = $derived(scrcpy.devices);
    const deviceModels = $derived(scrcpy.deviceModels);
    const deviceFriendlyNames = $derived(scrcpy.deviceFriendlyNames);
    const unavailableDevices = $derived(scrcpy.unavailableDevices);
    const runningDevices = $derived(scrcpy.runningDevices);
    const selectedDevice = $derived(scrcpy.activeDevice);
    const historyDevices = $derived(scrcpy.historyDevices);
    const mdnsDevices = $derived(scrcpy.mdnsDevices);
    const isRefreshing = $derived(scrcpy.isRefreshing);
    const wirelessSwitching = $derived(scrcpy.wirelessSwitching);

    const uniqueMdnsDevices = $derived.by(() => {
        const byHost = new Map<string, MdnsDevice>();
        for (const dev of mdnsDevices) {
            const key = mdnsHostIp(dev.address);
            const existing = byHost.get(key);
            const devIsPairing = dev.service.includes('_adb-tls-pairing');
            const existingIsPairing = existing?.service.includes('_adb-tls-pairing') ?? false;
            if (!existing || (devIsPairing && !existingIsPairing)) byHost.set(key, dev);
        }
        return Array.from(byHost.values());
    });

    const deviceGroups = $derived.by(() => {
        const byName = new Map<string, string[]>();
        for (const d of devices) {
            const name = deviceFriendlyNames[d] || deviceModels[d] || formatDeviceLabel(d);
            const ids = byName.get(name);
            if (ids) ids.push(d);
            else byName.set(name, [d]);
        }
        const groups: { name: string; ids: string[] }[] = [];
        for (const [name, ids] of byName) {
            const usb = ids.filter(id => !id.includes('.'));
            const wireless = ids.filter(id => id.includes('.'));
            if (usb.length === 1 && wireless.length === 1) {
                groups.push({ name, ids: [usb[0], wireless[0]] });
            } else {
                for (const id of ids) groups.push({ name, ids: [id] });
            }
        }
        return groups;
    });

    const isPairingModal = $derived(!!pairingTarget?.service.includes('_adb-tls-pairing'));
    const pairingModalTitle = $derived(
        isPairingModal ? t('sidebar.pairModalTitle') : t('sidebar.pairModalNotReadyTitle')
    );

    $effect(() => {
        if (!pairingTarget || pairingTarget.service.includes('_adb-tls-pairing')) return;
        const targetIp = mdnsHostIp(pairingTarget.address);
        const ready = uniqueMdnsDevices.find(
            d => d.service.includes('_adb-tls-pairing') && mdnsHostIp(d.address) === targetIp
        );
        if (ready) pairingTarget = ready;
    });

    $effect(() => {
        const waiting = !!pairingTarget && !pairingTarget.service.includes('_adb-tls-pairing');
        if (!waiting) return;
        const interval = setInterval(() => {
            if (document.visibilityState === 'hidden') return;
            void scrcpy.refreshDevices();
        }, 2000);
        return () => clearInterval(interval);
    });

    async function handleConnect(ip: string) {
        if (!ip) return;
        await scrcpy.connectDevice(ip);
    }

    async function completePairing(ip: string, code: string) {
        return scrcpy.pairDevice(ip, code);
    }

    async function submitPairingModal() {
        if (!pairingTarget || !modalCode || modalSubmitting) return;
        modalSubmitting = true;
        modalError = false;
        const res = await completePairing(pairingTarget.address, modalCode);
        modalSubmitting = false;
        if (res.success) {
            pairingTarget = null;
            modalCode = '';
        } else {
            modalError = true;
        }
    }

    function openPairing(dev: MdnsDevice) {
        pairingTarget = dev;
        modalCode = '';
        modalError = false;
    }
</script>

<aside class="lg:col-span-3 space-y-4">
    <div class="ds-card p-4 space-y-4">
        <div class="flex flex-wrap items-center gap-2 pb-2 mb-1" style="border-bottom: 1px solid var(--border-base)">
            <h2 class="ds-label flex items-center gap-2" style="color: var(--text-muted)">
                <Smartphone size={14} />
                {t('sidebar.deviceHub')}
            </h2>
            <div class="flex gap-2 items-center ml-auto">
                <button onclick={() => scrcpy.handleKillAdb()} class="ds-btn ds-btn-tertiary" title={t('sidebar.killAdbTitle')}>
                    <Zap size={10} />
                    {t('sidebar.killAdb')}
                </button>
                <button onclick={() => scrcpy.refreshDevices()} disabled={isRefreshing} class="ds-btn ds-btn-tertiary">
                    <RefreshCw size={10} class={isRefreshing ? 'animate-spin' : ''} />
                    {isRefreshing ? t('sidebar.syncing') : t('sidebar.refresh')}
                </button>
            </div>
        </div>

        <div class="space-y-2">
            <div class="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
                {#if devices.length === 0}
                    <div class="ds-panel p-4 text-center" style="border-style: dashed">
                        <span class="ds-caption" style="color: var(--text-muted)">{t('sidebar.noDevicesDetected')}</span>
                    </div>
                {:else}
                    {#each deviceGroups as group (group.ids[0])}
                        {@const ids = group.ids}
                        {@const primary = ids[0]}
                        {@const isRunning = runningDevices.some(r => ids.includes(r))}
                        {@const isSelected = selectedDevice != null && ids.includes(selectedDevice)}
                        {@const usbId = ids.find(id => !id.includes('.'))}
                        {@const hasWireless = ids.some(id => id.includes('.'))}
                        {@const switching = wirelessSwitching != null && ids.includes(wirelessSwitching)}
                        <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
                        <div
                            role="group"
                            tabindex="0"
                            aria-label={group.name}
                            onclick={() => scrcpy.setActiveDevice(primary)}
                            onkeydown={(e) => {
                                if (e.target !== e.currentTarget) return;
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    scrcpy.setActiveDevice(primary);
                                }
                            }}
                            class="ds-panel flex items-center gap-2 p-2 text-left w-full cursor-pointer"
                            style={isSelected ? 'border-color: var(--primary)' : undefined}
                        >
                            <div class="ds-inset p-1.5 flex items-center justify-center shrink-0">
                                <Smartphone size={14} style="color: {isSelected ? 'var(--primary)' : 'var(--text-muted)'}" />
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="ds-label truncate">{group.name}</p>
                                <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span class="flex items-center gap-1">
                                        <span class="ds-dot" data-live={isRunning}></span>
                                        <span class="ds-badge" data-live={isRunning}>
                                            {isRunning ? t('sidebar.live') : t('sidebar.ready')}
                                        </span>
                                    </span>
                                    {#if ids.length > 1}
                                        <div class="tpx-group" role="group" aria-label={t('sidebar.transport')}>
                                            {#each ids as id (id)}
                                                <button
                                                    type="button"
                                                    aria-pressed={selectedDevice === id}
                                                    aria-label="{id.includes('.') ? t('sidebar.wifi') : t('sidebar.usb')}: {id}"
                                                    class="tpx-seg"
                                                    data-active={selectedDevice === id ? 'true' : 'false'}
                                                    onclick={(e) => {
                                                        e.stopPropagation();
                                                        scrcpy.setActiveDevice(id);
                                                    }}
                                                >
                                                    {#if id.includes('.')}
                                                        <Wifi size={9.5} />
                                                        {t('sidebar.wifi')}
                                                    {:else}
                                                        <Usb size={9.5} />
                                                        {t('sidebar.usb')}
                                                    {/if}
                                                </button>
                                            {/each}
                                        </div>
                                    {:else}
                                        {#each ids as id (id)}
                                            <button
                                                type="button"
                                                aria-pressed={selectedDevice === id}
                                                aria-label="{id.includes('.') ? t('sidebar.wifi') : t('sidebar.usb')}: {id}"
                                                class="ds-badge cursor-pointer"
                                                style={selectedDevice === id
                                                    ? 'border-color: var(--primary); color: var(--primary)'
                                                    : undefined}
                                                onclick={(e) => {
                                                    e.stopPropagation();
                                                    scrcpy.setActiveDevice(id);
                                                }}
                                            >
                                                {#if id.includes('.')}
                                                    <Wifi size={9.5} />
                                                    {t('sidebar.wifi')}
                                                {:else}
                                                    <Usb size={9.5} />
                                                    {t('sidebar.usb')}
                                                {/if}
                                            </button>
                                        {/each}
                                    {/if}
                                    {#if usbId && !hasWireless}
                                        <button
                                            type="button"
                                            disabled={wirelessSwitching != null}
                                            onclick={(e) => {
                                                e.stopPropagation();
                                                void scrcpy.handleGotoWireless(usbId);
                                            }}
                                            class="ds-btn ds-btn-tertiary w-full mt-1"
                                            style="padding: 5px 8px; font-size: 11.5px; line-height: 14px; gap: 6px"
                                        >
                                            <Wifi size={11} />
                                            {switching ? t('sidebar.switching') : t('sidebar.gotoWireless')}
                                        </button>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>

            {#if unavailableDevices.length > 0}
                <div class="ds-panel p-2 space-y-1.5" role="status">
                    {#each unavailableDevices as device (device.serial)}
                        <div class="flex items-center gap-2 min-w-0">
                            <AlertTriangle size={12} class="shrink-0" />
                            <span class="ds-caption truncate" title={device.serial}>
                                {device.model || formatDeviceLabel(device.serial)}
                            </span>
                            <span class="ds-badge ml-auto shrink-0">
                                {device.state === 'unauthorized'
                                    ? t('sidebar.deviceUnauthorized')
                                    : device.state === 'offline'
                                      ? t('sidebar.deviceOffline')
                                      : t('sidebar.deviceUnavailable')}
                            </span>
                        </div>
                    {/each}
                </div>
            {/if}

            <div class="ds-tabs" role="tablist" aria-label={t('sidebar.deviceHub')}>
                <button
                    role="tab"
                    aria-selected={activeTab === 'usb'}
                    data-active={activeTab === 'usb'}
                    onclick={() => (activeTab = 'usb')}
                    class="ds-tab"
                >
                    <Usb size={11} /> {t('sidebar.usb')}
                </button>
                <button
                    role="tab"
                    aria-selected={activeTab === 'wireless'}
                    data-active={activeTab === 'wireless'}
                    onclick={() => (activeTab = 'wireless')}
                    class="ds-tab"
                >
                    <Wifi size={11} /> {t('sidebar.wireless')}
                </button>
            </div>

            {#if activeTab === 'usb'}
                <div class="pt-1">
                    <div class="ds-panel p-3 space-y-1.5">
                        <div class="flex items-center gap-2">
                            <span class="ds-dot" data-live="false"></span>
                            <span class="ds-label">{t('sidebar.usbSetupTip')}</span>
                        </div>
                        <p class="ds-caption" style="color: var(--text-muted)">
                            {t('sidebar.usbSetupTipTextBefore')}
                            <span class="ds-strong" style="color: var(--text-base)">{t('sidebar.usbSetupTipDeveloperOptions')}</span>
                            {t('sidebar.usbSetupTipAnd')}
                            <span class="ds-strong" style="color: var(--text-base)">{t('sidebar.usbSetupTipUsbDebugging')}</span>
                            {t('sidebar.usbSetupTipTextAfter')}
                        </p>
                    </div>
                </div>
            {/if}

            {#if activeTab === 'wireless'}
                <div class="space-y-5 pt-2">
                    <div class="ds-panel p-3 space-y-1.5">
                        <div class="flex items-center gap-2">
                            <span class="ds-dot" data-live="false"></span>
                            <span class="ds-label">{t('sidebar.wirelessSetupTip')}</span>
                        </div>
                        <p class="ds-caption" style="color: var(--text-muted)">
                            {t('sidebar.wirelessSetupTipTextBefore')}
                            <span class="ds-strong" style="color: var(--text-base)">{t('sidebar.wirelessSetupTipSameWifi')}</span>
                            {t('sidebar.wirelessSetupTipAnd')}
                            <span class="ds-strong" style="color: var(--text-base)">{t('sidebar.wirelessSetupTipWirelessDebugging')}</span>
                            {t('sidebar.wirelessSetupTipTextAfter')}
                        </p>
                    </div>
                    <div class="space-y-3">
                        <div class="pb-1.5" style="border-bottom: 1px solid var(--border-base)">
                            <label class="ds-label" for="sidebar-connect-ip">{t('sidebar.ipConnect')}</label>
                        </div>
                        <div class="flex gap-2">
                            <div class="relative flex-1 flex items-center gap-2">
                                <Wifi size={10} class="shrink-0" />
                                <input
                                    id="sidebar-connect-ip"
                                    type="text"
                                    placeholder={t('sidebar.ipPlaceholder')}
                                    bind:value={connectIp}
                                    class="ds-input w-full"
                                />
                            </div>
                            <button onclick={() => handleConnect(connectIp)} disabled={isRefreshing} class="ds-btn ds-btn-secondary">
                                {isRefreshing ? t('sidebar.connecting') : t('sidebar.connect')}
                            </button>
                        </div>
                    </div>

                    {#if uniqueMdnsDevices.filter(dev => !isMdnsDeviceConnected(dev, devices)).length > 0}
                        <div class="space-y-3 pt-1">
                            <div class="flex items-center justify-between pb-1.5" style="border-bottom: 1px solid var(--border-base)">
                                <span class="ds-label">{t('sidebar.discoveredDevices')}</span>
                            </div>
                            <p class="ds-caption" style="color: var(--text-muted)">{t('sidebar.discoveredHint')}</p>
                            <div class="space-y-2">
                                {#each uniqueMdnsDevices.filter(dev => !isMdnsDeviceConnected(dev, devices)) as dev (dev.name)}
                                    <button disabled={isRefreshing} onclick={() => openPairing(dev)} class="ds-panel w-full flex items-center justify-between p-2 text-left">
                                        <div class="flex items-center gap-2 min-w-0">
                                            <Wifi size={10} class="shrink-0" />
                                            <span class="ds-label truncate" title="{dev.address} ({formatMdnsName(dev.name)})">
                                                {dev.address} ({formatMdnsName(dev.name)})
                                            </span>
                                        </div>
                                        <span class="ds-caption shrink-0 ml-2" style="color: var(--primary)">{t('sidebar.startPairing')}</span>
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    {#if historyDevices.length > 0}
                        <div class="space-y-3 pt-1">
                            <div class="flex items-center justify-between pb-1.5" style="border-bottom: 1px solid var(--border-base)">
                                <span class="ds-label">{t('sidebar.recentDevices')}</span>
                                <button onclick={() => scrcpy.clearHistory()} class="ds-btn ds-btn-tertiary">{t('sidebar.clear')}</button>
                            </div>
                            <div class="space-y-2">
                                {#each historyDevices as ip (ip)}
                                    <button
                                        disabled={isRefreshing}
                                        onclick={() => {
                                            connectIp = ip;
                                            void handleConnect(ip);
                                        }}
                                        class="ds-panel w-full flex items-center justify-between p-2"
                                    >
                                        <span class="flex items-center gap-2">
                                            <Wifi size={10} />
                                            <span class="ds-label">{ip}</span>
                                        </span>
                                        <span class="ds-caption" style="color: var(--primary)">{t('sidebar.connect')}</span>
                                    </button>
                                {/each}
                            </div>
                        </div>
                    {/if}

                    <div class="space-y-3 pt-1">
                        <div class="pb-1.5" style="border-bottom: 1px solid var(--border-base)">
                            <span class="ds-label">{t('sidebar.pairDeviceTitle')}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <div class="space-y-1">
                                <label class="ds-caption" for="sidebar-pair-ip" style="color: var(--text-muted)">{t('sidebar.ipPortPlaceholder')}</label>
                                <input id="sidebar-pair-ip" type="text" placeholder={t('sidebar.ipPortPlaceholder')} bind:value={pairIp} class="ds-input w-full" />
                            </div>
                            <div class="space-y-1">
                                <label class="ds-caption" for="sidebar-pair-code" style="color: var(--text-muted)">{t('sidebar.pairingCodePlaceholder')}</label>
                                <input
                                    id="sidebar-pair-code"
                                    type="text"
                                    placeholder={t('sidebar.pairingCodePlaceholder')}
                                    bind:value={pairCode}
                                    class="ds-input w-full"
                                    style={pairIp ? 'border-style: dashed' : undefined}
                                />
                            </div>
                        </div>
                        <button
                            onclick={async () => {
                                if (!pairIp || !pairCode || isRefreshing) return;
                                const res = await completePairing(pairIp, pairCode);
                                if (res.success) pairCode = '';
                            }}
                            disabled={isRefreshing}
                            class="ds-btn ds-btn-primary w-full"
                        >
                            {isRefreshing ? t('sidebar.synchronizing') : t('sidebar.startPairing')}
                        </button>
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <div
        onclick={() => scrcpy.handleFileBrowse()}
        onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void scrcpy.handleFileBrowse();
            }
        }}
        role="button"
        tabindex={0}
        aria-label={t('sidebar.flashPushFiles')}
        class="ds-panel p-5 flex flex-col items-center justify-center gap-2 cursor-pointer"
        style="border-style: dashed"
    >
        <div class="ds-inset p-3 rounded-full flex items-center justify-center">
            <UploadCloud size={24} />
        </div>
        <div class="text-center">
            <h3 class="ds-label">{t('sidebar.flashPushFiles')}</h3>
            <p class="ds-caption mt-1" style="color: var(--text-muted)">{t('sidebar.flashPushSubtitle')}</p>
        </div>
    </div>
</aside>

{#if pairingTarget}
    <SheetModal
        isOpen
        onClose={() => (pairingTarget = null)}
        title={pairingModalTitle}
        overlayClassName="p-6"
        panelClassName="w-full max-w-sm p-6"
    >
        {#snippet footer()}
            {#if isPairingModal}
                <button onclick={submitPairingModal} disabled={!modalCode || modalSubmitting} class="ds-btn ds-btn-primary w-full">
                    {modalSubmitting ? t('sidebar.synchronizing') : t('common.ok')}
                </button>
            {:else}
                <button onclick={() => (pairingTarget = null)} class="ds-btn ds-btn-secondary w-full">{t('common.cancel')}</button>
            {/if}
        {/snippet}
        <p class="ds-caption truncate mb-4" style="color: var(--text-muted)">
            {pairingTarget.address} ({formatMdnsName(pairingTarget.name)})
        </p>
        {#if isPairingModal}
            <label class="ds-label block mb-1" for="sidebar-modal-code">{t('sidebar.pairingCodePlaceholder')}</label>
            <input
                id="sidebar-modal-code"
                data-autofocus
                type="text"
                placeholder={t('sidebar.pairingCodePlaceholder')}
                bind:value={modalCode}
                oninput={() => (modalError = false)}
                onkeydown={(e) => {
                    if (e.key === 'Enter') void submitPairingModal();
                }}
                class="ds-input w-full mb-2"
            />
            {#if modalError}
                <p class="ds-badge mb-2" style="border-style: dashed">{t('sidebar.pairModalError')}</p>
            {/if}
        {:else}
            <p class="ds-caption mb-4" style="color: var(--text-secondary)">{t('sidebar.pairModalNotReadyBody')}</p>
            <div class="flex items-center justify-center gap-2" style="color: var(--text-muted)">
                <RefreshCw size={12} class="animate-spin" />
                <span class="ds-label">{t('sidebar.pairModalWaiting')}</span>
            </div>
        {/if}
    </SheetModal>
{/if}
