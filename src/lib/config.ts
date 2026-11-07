import type {
    MicSource,
    ScrcpyConfig,
    SessionMode
} from './types';

export const DEFAULT_CONFIG: ScrcpyConfig = {
    device: '',
    sessionMode: 'mirror',
    bitrate: 8,
    fps: undefined,
    stayAwake: false,
    turnOff: false,
    audioEnabled: true,
    audioCodec: 'auto',
    alwaysOnTop: false,
    res: '0',
    recordPath: '',
    vdWidth: 1920,
    vdHeight: 1080,
    vdDpi: 420,
    aspectRatioLock: true,
    hidKeyboard: false,
    hidMouse: false,
    flexDisplay: false,
    cameraTorch: false,
    cameraZoom: 1.0,
    backgroundColor: '',
    keepActive: false,
    vsync: true,
    rememberWindowPosition: true,
    ignoreVideoEncoderConstraints: false
};

const SESSION_MODES: SessionMode[] = ['mirror', 'camera', 'desktop', 'mic'];
const AUDIO_CODECS = ['auto', 'opus', 'aac', 'flac', 'raw'] as const;
const MIC_SOURCES = ['mic', 'mic-voice-communication'] as const;
const MIC_CODECS = ['opus', 'aac'] as const;
const ROTATIONS = ['0', '90', '180', '270'] as const;
const CAMERA_FACINGS = ['front', 'back', 'external'] as const;

/** Persisted config is a trust boundary: localStorage can be stale or edited.
 *  Normalize enums before the value reaches the store/backend. */
export function normalizeConfig(raw: Partial<ScrcpyConfig> | null): ScrcpyConfig {
    const config: ScrcpyConfig = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
    if (!SESSION_MODES.includes(config.sessionMode)) config.sessionMode = 'mirror';
    if (config.audioCodec && !AUDIO_CODECS.includes(config.audioCodec)) config.audioCodec = 'auto';

    // Older builds persisted "voice-communication"; the raw value can be any
    // string because localStorage is not typed.
    const rawMicSource = (raw as { micSource?: unknown } | null)?.micSource;
    if (rawMicSource === 'voice-communication') config.micSource = 'mic-voice-communication';
    else if (typeof rawMicSource === 'string' && !MIC_SOURCES.includes(rawMicSource as MicSource)) {
        config.micSource = 'mic';
    }
    if (config.micCodec && !MIC_CODECS.includes(config.micCodec)) config.micCodec = 'opus';
    if (config.rotation && !ROTATIONS.includes(config.rotation)) config.rotation = '0';
    if (config.cameraFacing && !CAMERA_FACINGS.includes(config.cameraFacing)) {
        config.cameraFacing = undefined;
    }
    return config;
}
