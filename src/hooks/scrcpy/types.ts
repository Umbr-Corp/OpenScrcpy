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
    return devices.includes(dev.address) || devices.some(d => d.includes(dev.name));
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
}
