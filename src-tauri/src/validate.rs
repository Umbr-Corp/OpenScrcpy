//! Allowlist validation for values that become process arguments.
//!
//! The frontend is not a trust boundary: a stale localStorage entry or a
//! modified webview can send any string. Validate here, before it reaches
//! `adb` or `scrcpy`, and keep the accepted values in one place.

pub const VIDEO_CODECS: &[&str] = &["h264", "h265", "av1"];
pub const AUDIO_CODECS: &[&str] = &["auto", "opus", "aac", "flac", "raw"];
// scrcpy names the VOICE_COMMUNICATION source "mic-voice-communication".
// "voice-communication" is the value persisted by older OpenScrcpy builds;
// it stays accepted here and is normalized before it reaches the command
// line, so users with an old localStorage entry keep working.
pub const MIC_SOURCES: &[&str] = &["mic", "mic-voice-communication", "voice-communication"];
pub const MIC_CODECS: &[&str] = &["opus", "aac"];
pub const ROTATIONS: &[&str] = &["0", "90", "180", "270"];

// UI sliders: bitrate 1..50 Mbps, fps 30..120. The backend range is wider so
// a config written by an older build still works.
pub const FPS_RANGE: std::ops::RangeInclusive<u32> = 1..=240;
pub const BITRATE_RANGE: std::ops::RangeInclusive<u32> = 1..=100;

fn allowlisted(field: &str, value: Option<&str>, allowed: &[&str]) -> Result<(), String> {
    let Some(value) = value else {
        return Ok(());
    };
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(format!("Invalid {}: {:?}", field, value))
    }
}

pub fn video_codec(value: Option<&str>) -> Result<(), String> {
    allowlisted("video codec", value, VIDEO_CODECS)
}

pub fn audio_codec(value: Option<&str>) -> Result<(), String> {
    allowlisted("audio codec", value, AUDIO_CODECS)
}

pub fn mic_source(value: Option<&str>) -> Result<(), String> {
    allowlisted("microphone source", value, MIC_SOURCES)
}

/// Map the value saved by older builds to the source name scrcpy expects.
/// Everything else is returned unchanged (validation is responsible for
/// rejecting unknown values).
pub fn normalize_mic_source(value: &str) -> &str {
    match value {
        "voice-communication" => "mic-voice-communication",
        other => other,
    }
}

pub fn mic_codec(value: Option<&str>) -> Result<(), String> {
    allowlisted("microphone codec", value, MIC_CODECS)
}

pub fn rotation(value: Option<&str>) -> Result<(), String> {
    allowlisted("rotation", value, ROTATIONS)
}

pub fn fps(value: Option<u32>) -> Result<(), String> {
    match value {
        Some(value) if !FPS_RANGE.contains(&value) => Err(format!("Invalid fps: {}", value)),
        _ => Ok(()),
    }
}

pub fn bitrate(value: Option<u32>) -> Result<(), String> {
    match value {
        Some(value) if !BITRATE_RANGE.contains(&value) => {
            Err(format!("Invalid bitrate: {}", value))
        }
        _ => Ok(()),
    }
}

/// Device serials become the argument after `-s`. A leading `-` would let a
/// value be parsed as another adb/scrcpy flag.
pub fn device(value: &str) -> Result<(), String> {
    if value.starts_with('-') {
        Err("Invalid device serial".to_string())
    } else {
        Ok(())
    }
}

/// `adb connect`/`adb pair` accept an IPv4 address, optionally with a port,
/// or a hostname with a port. Whitespace and leading flags are rejected.
pub fn adb_address(value: &str) -> Result<(), String> {
    if value.is_empty() || value.chars().any(char::is_whitespace) || value.starts_with('-') {
        return Err("Invalid ADB address".to_string());
    }

    let Some((host, port)) = value.rsplit_once(':') else {
        return match value.parse::<std::net::Ipv4Addr>() {
            Ok(_) => Ok(()),
            Err(_) => Err("Invalid ADB address".to_string()),
        };
    };

    if port.is_empty()
        || !port.chars().all(|c| c.is_ascii_digit())
        || port.parse::<u16>().map_or(true, |p| p == 0)
    {
        return Err("Invalid ADB port".to_string());
    }

    let host_is_ipv4 = host.parse::<std::net::Ipv4Addr>().is_ok();
    let host_is_name = !host.is_empty()
        && host.len() <= 253
        && host.chars().any(|c| c.is_ascii_alphabetic())
        && host.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        });

    if host_is_ipv4 || host_is_name {
        Ok(())
    } else {
        Err("Invalid ADB address".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowlists_accept_the_ui_values() {
        for codec in VIDEO_CODECS {
            assert!(video_codec(Some(codec)).is_ok(), "{codec}");
        }
        for codec in AUDIO_CODECS {
            assert!(audio_codec(Some(codec)).is_ok(), "{codec}");
        }
        for source in MIC_SOURCES {
            assert!(mic_source(Some(source)).is_ok(), "{source}");
        }
        for codec in MIC_CODECS {
            assert!(mic_codec(Some(codec)).is_ok(), "{codec}");
        }
        for value in ROTATIONS {
            assert!(rotation(Some(value)).is_ok(), "{value}");
        }
        assert!(fps(Some(1)).is_ok());
        assert!(fps(Some(240)).is_ok());
        assert!(bitrate(Some(1)).is_ok());
        assert!(bitrate(Some(100)).is_ok());
        assert!(video_codec(None).is_ok());
    }

    #[test]
    fn allowlists_reject_unknown_empty_and_uppercase_values() {
        assert!(video_codec(Some("vp9")).is_err());
        assert!(video_codec(Some("H264")).is_err());
        assert!(video_codec(Some("")).is_err());
        assert!(audio_codec(Some("AAC")).is_err());
        assert!(audio_codec(Some("")).is_err());
        assert!(mic_source(Some("speaker")).is_err());
        assert!(mic_source(Some("mic-voice-communication")).is_ok());
        assert_eq!(
            normalize_mic_source("voice-communication"),
            "mic-voice-communication"
        );
        assert_eq!(normalize_mic_source("mic"), "mic");
        assert!(mic_codec(Some("flac")).is_err());
        assert!(rotation(Some("45")).is_err());
        assert!(fps(Some(0)).is_err());
        assert!(fps(Some(241)).is_err());
        assert!(bitrate(Some(0)).is_err());
        assert!(bitrate(Some(101)).is_err());
    }

    #[test]
    fn device_rejects_leading_flag() {
        assert!(device("emulator-5554").is_ok());
        assert!(device("adb-ZY22MGW35T (2)._adb-tls-connect._tcp").is_ok());
        assert!(device("-s").is_err());
        assert!(device("--serial").is_err());
    }

    #[test]
    fn adb_address_accepts_ipv4_and_host_with_port() {
        assert!(adb_address("192.168.1.50").is_ok());
        assert!(adb_address("192.168.1.50:5555").is_ok());
        assert!(adb_address("adb.local:5555").is_ok());
    }

    #[test]
    fn adb_address_rejects_flags_spaces_and_bad_ports() {
        assert!(adb_address("-s").is_err());
        assert!(adb_address("192.168.1.50:5555 --help").is_err());
        assert!(adb_address(" 192.168.1.50:5555").is_err());
        assert!(adb_address("192.168.1.50:0").is_err());
        assert!(adb_address("192.168.1.50:65536").is_err());
        assert!(adb_address("192.168.1.50:").is_err());
        assert!(adb_address("not-an-ip").is_err());
        assert!(adb_address("-bad.local:5555").is_err());
    }
}
