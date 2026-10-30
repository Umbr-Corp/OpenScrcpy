export interface RenderDriverOption {
    id: string;
    label: string;
}

export interface RenderDriverSupport {
    hostOs: string;
    supportsRenderDriver: boolean;
    supportedDrivers: RenderDriverOption[];
}

export interface MdnsDevice {
    name: string;
    service: string;
    address: string;
}

/** Whether an mDNS-discovered device is already present in `devices`.
 *  A device connected via a plain `adb connect ip:port` is tracked under that
 *  same "ip:port" serial, but one already connected through wireless
 *  debugging's mDNS pairing (e.g. paired via Android Studio, not through this
 *  app) is tracked under its "adb-<name>._adb-tls-connect._tcp" serial
 *  instead -- which never matches `dev.address`. Checking both forms is what
 *  keeps an already-connected device from being listed a second time under
 *  "Discovered Devices", or auto-(re)connected by IP. */
export function isMdnsDeviceConnected(dev: MdnsDevice, devices: string[]): boolean {
    const serials = [
        `${dev.name}._adb-tls-connect._tcp`,
        `${dev.name}._adb-tls-connect._tcp (2)`,
        `${dev.name}._adb-tls-connect._udp`,
        `${dev.name}._adb-tls-connect._udp (2)`,
    ];
    return devices.includes(dev.address) || devices.some(d => serials.includes(d));
}

/** Shape shared by the adb/scrcpy commands that report success or failure. */
export interface CommandResult {
    success: boolean;
    message?: string;
    output?: string;
    stdout?: string;
    stderr?: string;
    binary?: string;
}

/** A transport adb sees but cannot use yet: unauthorized (the phone is still
 *  showing the debugging prompt) or offline. */
export interface UnavailableDevice {
    serial: string;
    state: string;
    model?: string;
}

/** `get_devices`: the device hub's polling response. */
export interface DeviceListResult {
    error?: boolean;
    message?: string;
    devices?: string[];
    deviceModels?: Record<string, string>;
    unavailable?: UnavailableDevice[];
}

/** `get_mdns_devices`: wireless-debugging service records. */
export interface MdnsDevicesResult {
    error?: boolean;
    message?: string;
    services?: MdnsDevice[];
}

/** `check_scrcpy`: whether the bundled binaries are usable. */
export interface DownloadStatus {
    found: boolean;
    message: string;
}

/** The "adb-<serial>-<suffix>" mDNS instance name has a random suffix that is
 *  regenerated for every service record, so `_adb-tls-connect` and
 *  `_adb-tls-pairing` broadcasts of the same phone never share a full name.
 *  The host IP is the stable identity across both records. */
export function mdnsHostIp(address: string): string {
    // Handles "192.168.0.104:42657" and "[fe80::1%en0]:42657" alike.
    const lastColon = address.lastIndexOf(':');
    return lastColon > 0 ? address.slice(0, lastColon) : address;
}

export interface ScrcpyConfig {
    device: string;
    sessionMode: string;
    bitrate?: number;
    fps?: number;
    stayAwake?: boolean;
    turnOff?: boolean;
    audioEnabled?: boolean;
    audioCodec?: string;
    alwaysOnTop?: boolean;
    fullscreen?: boolean;
    borderless?: boolean;
    record?: boolean;
    recordPath?: string;
    scrcpyPath?: string;
    otgPure?: boolean;
    cameraFacing?: string;
    cameraId?: string;
    codec?: string;
    cameraAr?: string;
    cameraHighSpeed?: boolean;
    vdWidth?: number;
    vdHeight?: number;
    vdDpi?: number;
    rotation?: string;
    res?: string;
    aspectRatioLock?: boolean;
    hidKeyboard?: boolean;
    hidMouse?: boolean;
    renderDriver?: string;
    // v4 features
    flexDisplay?: boolean;
    cameraTorch?: boolean;
    cameraZoom?: number;
    backgroundColor?: string;
    keepActive?: boolean;
    vsync?: boolean;
    /** Whether to remember each device's mirror window position and restore
     *  it on the next launch. Defaults to true; some users find a window
     *  that always reopens at scrcpy's default spot less surprising. */
    rememberWindowPosition?: boolean;
    // v4.1 features
    /** Ignore video encoder size constraints (--ignore-video-encoder-constraints).
     *  Useful for devices that report incorrect encoder limits (scrcpy v4.1+). */
    ignoreVideoEncoderConstraints?: boolean;
    /** Screen position (pixels) to restore via --window-x / --window-y for
     *  this launch. Resolved per-device from windowPositions right before
     *  invoking run_scrcpy; never set directly by the UI. */
    windowX?: number;
    windowY?: number;
    /** Mic bridge (audio-only capture source). */
    /** Audio source: "mic" (raw) or "voice-communication" (Android NS/AGC/AEC). */
    micSource?: string;
    /** Lossy codec: "opus" (default) or "aac". */
    micCodec?: string;
    /** Bitrate in kbps for lossy mic codecs (32..256, default 128). */
    micBitrate?: number;
    /** Experimental: PipeWire RNNoise filter-chain sink on the PC. */
    micDenoise?: boolean;
}

/** Typed writer for one config field: `handleChange('micBitrate', val)` must
 *  hand over a number, `handleChange('res', val)` a string, etc. Swapping a
 *  wrong type across the dropdown boundary becomes a compile error at that
 *  call site instead of a runtime one (frontend audit P2-6). */
export type ConfigFieldSetter = <K extends keyof ScrcpyConfig>(
    field: K,
    value: ScrcpyConfig[K]
) => void;
