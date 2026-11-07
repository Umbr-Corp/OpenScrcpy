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

export function isMdnsDeviceConnected(dev: MdnsDevice, devices: string[]): boolean {
    const serials = [
        `${dev.name}._adb-tls-connect._tcp`,
        `${dev.name}._adb-tls-connect._tcp (2)`,
        `${dev.name}._adb-tls-connect._udp`,
        `${dev.name}._adb-tls-connect._udp (2)`,
    ];
    return devices.includes(dev.address) || devices.some(d => serials.includes(d));
}

export interface CommandResult {
    success: boolean;
    message?: string;
    output?: string;
    stdout?: string;
    stderr?: string;
    binary?: string;
}

export interface UnavailableDevice {
    serial: string;
    state: string;
    model?: string;
}

export interface DeviceListResult {
    error?: boolean;
    message?: string;
    devices?: string[];
    deviceModels?: Record<string, string>;
    unavailable?: UnavailableDevice[];
}

export interface MdnsDevicesResult {
    error?: boolean;
    message?: string;
    services?: MdnsDevice[];
}

export interface DownloadStatus {
    found: boolean;
    message: string;
}

export function mdnsHostIp(address: string): string {
    const lastColon = address.lastIndexOf(':');
    return lastColon > 0 ? address.slice(0, lastColon) : address;
}

export type SessionMode = 'mirror' | 'camera' | 'desktop' | 'mic';
export type AudioCodec = 'auto' | 'opus' | 'aac' | 'flac' | 'raw';
export type MicSource = 'mic' | 'mic-voice-communication';
export type MicCodec = 'opus' | 'aac';
export type Rotation = '0' | '90' | '180' | '270';
export type ColorMode = 'light' | 'dark' | 'system';
export type CameraFacing = 'front' | 'back' | 'external';

export interface ScrcpyConfig {
    device: string;
    sessionMode: SessionMode;
    bitrate?: number;
    fps?: number;
    stayAwake?: boolean;
    turnOff?: boolean;
    audioEnabled?: boolean;
    audioCodec?: AudioCodec;
    alwaysOnTop?: boolean;
    fullscreen?: boolean;
    borderless?: boolean;
    record?: boolean;
    recordPath?: string;
    scrcpyPath?: string;
    otgPure?: boolean;
    cameraFacing?: CameraFacing;
    cameraId?: string;
    codec?: string;
    cameraAr?: string;
    cameraHighSpeed?: boolean;
    vdWidth?: number;
    vdHeight?: number;
    vdDpi?: number;
    rotation?: Rotation;
    res?: string;
    aspectRatioLock?: boolean;
    hidKeyboard?: boolean;
    hidMouse?: boolean;
    renderDriver?: string;
    flexDisplay?: boolean;
    cameraTorch?: boolean;
    cameraZoom?: number;
    backgroundColor?: string;
    keepActive?: boolean;
    vsync?: boolean;
    rememberWindowPosition?: boolean;
    ignoreVideoEncoderConstraints?: boolean;
    windowX?: number;
    windowY?: number;
    micSource?: MicSource;
    micCodec?: MicCodec;
    micBitrate?: number;
    micDenoise?: boolean;
}

export type ConfigFieldSetter = <K extends keyof ScrcpyConfig>(
    field: K,
    value: ScrcpyConfig[K]
) => void;

export interface DeviceGroup {
    name: string;
    ids: string[];
}
