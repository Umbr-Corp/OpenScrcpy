use crate::download;
use crate::process;
use crate::validate;
use crate::{ScrcpyState, SessionHandle, StopRequest};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::{Command as StdCommand, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use tauri::{Emitter, Manager, State, Window};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::sync::{oneshot, Notify};
use tokio::time::{timeout, Duration};

const AUDIO_FALLBACK_CHAIN: &[&str] = &["aac", "flac", "raw"];

fn is_audio_codec_error(text: &str) -> bool {
    let lower = text.to_lowercase();
    if lower.contains("could not create default audio encoder")
        || lower.contains("failed to initialize audio")
    {
        return true;
    }
    let mentions_codec = lower.contains("audio encoder") || lower.contains("audio codec");
    let mentions_failure = lower.contains("fail")
        || lower.contains("error")
        || lower.contains("could not")
        || lower.contains("not available")
        || lower.contains("not supported");
    mentions_codec && mentions_failure
}

fn get_binary_path(binary_name: &str, custom_folder: Option<String>) -> String {
    let exe_ext = std::env::consts::EXE_EXTENSION;
    let binary_filename = if exe_ext.is_empty() {
        binary_name.to_string()
    } else {
        format!("{}.{}", binary_name, exe_ext)
    };

    // 1. Check custom folder if provided
    if let Some(folder) = custom_folder {
        if !folder.trim().is_empty() {
            let full_path = Path::new(&folder).join(&binary_filename);
            if full_path.exists() && full_path.is_file() {
                return full_path.to_string_lossy().to_string();
            }
        }
    }

    // 2. Check local scrcpy-bin folder (relative to executable for portable/production)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let local_bin = exe_dir.join("scrcpy-bin").join(&binary_filename);
            if local_bin.exists() && local_bin.is_file() {
                return local_bin.to_string_lossy().to_string();
            }
        }
    }

    // 3. Check the directory resolved at startup (app data when the exe
    // directory is read-only, e.g. /usr/bin or Program Files).
    if let Some(dir) = download::install_dir() {
        let installed = dir.join(&binary_filename);
        if installed.exists() && installed.is_file() {
            return installed.to_string_lossy().to_string();
        }
    }

    // 4. Fallback to current working directory scrcpy-bin
    if let Ok(current_dir) = std::env::current_dir() {
        let local_bin = current_dir.join("scrcpy-bin").join(&binary_filename);
        if local_bin.exists() && local_bin.is_file() {
            return local_bin.to_string_lossy().to_string();
        }
    }

    // 5. Return simple name to rely on system PATH
    binary_name.to_string()
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn create_command<S: AsRef<std::ffi::OsStr>>(program: S) -> TokioCommand {
    let cmd = TokioCommand::new(program);
    #[cfg(target_os = "windows")]
    {
        let mut cmd = cmd;
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(target_os = "windows"))]
    cmd
}

/// Client for the GitHub release calls. The connect deadline is what keeps a
/// stalled TCP/TLS handshake from hanging the download or update UI forever;
/// individual requests still set their own total timeout.
fn http_client(user_agent: &str) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(user_agent)
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_scrcpy(custom_path: Option<String>) -> serde_json::Value {
    let exe_path = get_binary_path("scrcpy", custom_path);

    // Check version to verify it exists and is runnable
    let mut cmd = create_command(&exe_path);
    cmd.arg("--version");
    let output = process::output_with_timeout(cmd, Duration::from_secs(5)).await;

    match output {
        Ok(o) if o.status.success() => {
            json!({ "found": true, "message": "Scrcpy Ready" })
        }
        Ok(_) => {
            json!({ "found": false, "message": "Failed to start scrcpy (Exit Code != 0)" })
        }
        Err(_) => {
            json!({ "found": false, "message": "Scrcpy not found" })
        }
    }
}

/// ADB device states that can appear in the second column of `adb devices -l`
/// output. Only "device" means the device is connected and authorized; every
/// other state (offline, mid-pairing, unauthorized, ...) is not usable yet.
const KNOWN_ADB_STATES: &[&str] = &[
    "device",
    "offline",
    "unauthorized",
    "authorizing",
    "unknown",
    "bootloader",
    "recovery",
    "sideload",
    "host",
    "connecting",
];

/// Parses one data line of `adb devices -l` output into `(serial, state)`.
///
/// The serial and state are whitespace-separated, but the serial itself can
/// contain a space: an mDNS wireless-debugging serial in "conflict" form
/// (when two devices would otherwise resolve to the same mDNS name) looks
/// like `adb-SERIAL (2)._adb-tls-connect._tcp`. Splitting on the first
/// whitespace run, or assuming a specific serial shape, would misparse that
/// case. Instead this finds the first token that is a *known ADB state* and
/// treats everything before it as the serial, so it corresponds to the state
/// ADB actually reports, regardless of the serial's shape (USB ID, IP:port,
/// or mDNS name). Any further `-l` fields (`product:... model:...
/// transport_id:...`) are simply ignored.
fn parse_adb_device_line(line: &str) -> Option<(String, String)> {
    let tokens: Vec<&str> = line.split_whitespace().collect();
    let state_idx = tokens.iter().position(|t| KNOWN_ADB_STATES.contains(t))?;
    if state_idx == 0 {
        return None; // no serial before the state
    }
    Some((tokens[..state_idx].join(" "), tokens[state_idx].to_string()))
}

/// Extracts the `model:` field from a `adb devices -l` line, if present, for
/// a more user-friendly device label than the raw serial (e.g. "SM S911B"
/// instead of a USB serial or IP:port). Adb replaces spaces in the model name
/// with underscores in this raw form; those are turned back into spaces,
/// which is as far as this goes without an extra `getprop` round-trip per
/// device -- still closer to a real name than a serial.
fn extract_device_model(line: &str) -> Option<String> {
    let model = line
        .split_whitespace()
        .find_map(|t| t.strip_prefix("model:"))?;
    if model.is_empty() {
        return None;
    }
    Some(model.replace('_', " "))
}

#[tauri::command]
pub async fn get_devices(custom_path: Option<String>) -> serde_json::Value {
    let adb_path = get_binary_path("adb", custom_path);

    let mut cmd = create_command(&adb_path);
    cmd.arg("devices").arg("-l");
    let output = process::output_with_timeout(cmd, Duration::from_secs(10)).await;

    match output {
        Ok(o) => {
            if o.status.success() {
                let out_str = String::from_utf8_lossy(&o.stdout);
                let mut devices: Vec<String> = Vec::new();
                let mut device_models = serde_json::Map::new();
                for line in out_str.lines().skip(1) {
                    // Skip "List of devices attached"
                    let Some((serial, state)) = parse_adb_device_line(line) else {
                        continue;
                    };
                    if state != "device" {
                        continue;
                    }
                    if let Some(model) = extract_device_model(line) {
                        device_models.insert(serial.clone(), json!(model));
                    }
                    devices.push(serial);
                }

                json!({ "error": false, "devices": devices, "deviceModels": device_models })
            } else {
                json!({ "error": true, "message": "ADB returned error" })
            }
        }
        Err(e) => {
            json!({ "error": true, "message": e.to_string() })
        }
    }
}

#[tauri::command]
pub async fn get_mdns_devices(custom_path: Option<String>) -> serde_json::Value {
    let adb_path = get_binary_path("adb", custom_path);

    let mut cmd = create_command(&adb_path);
    cmd.arg("mdns").arg("services");
    let output = process::output_with_timeout(cmd, Duration::from_secs(10)).await;

    match output {
        Ok(o) => {
            if o.status.success() {
                let out_str = String::from_utf8_lossy(&o.stdout);
                let mut services = Vec::new();
                let mut seen = std::collections::HashSet::new();
                for line in out_str.lines().skip(1) {
                    let parts: Vec<&str> = line.split('\t').collect();
                    if parts.len() >= 3 {
                        let name = parts[0].trim();
                        let service = parts[1].trim();
                        let address = parts[2].trim();
                        let key = format!("{}|{}|{}", name, service, address);
                        if !seen.contains(&key) {
                            services.push(json!({
                                "name": name,
                                "service": service,
                                "address": address
                            }));
                            seen.insert(key);
                        }
                    }
                }
                json!({ "error": false, "services": services })
            } else {
                json!({ "error": true, "message": "ADB mdns returned error" })
            }
        }
        Err(e) => {
            json!({ "error": true, "message": e.to_string() })
        }
    }
}

#[tauri::command]
pub async fn adb_connect(
    window: Window,
    ip: String,
    custom_path: Option<String>,
    silent: Option<bool>,
) -> Result<serde_json::Value, String> {
    validate::adb_address(&ip)?;
    let silent = silent.unwrap_or(false);
    let adb_path = get_binary_path("adb", custom_path);
    if !silent {
        let _ = window.emit(
            "scrcpy-log",
            format!("[SYSTEM] Attempting wireless connection to {}...", ip),
        );
    }

    let mut cmd = create_command(&adb_path);
    cmd.arg("connect").arg(&ip);
    let output_res = process::output_with_timeout(cmd, Duration::from_secs(5)).await;

    match output_res {
        Ok(output) => {
            let out_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let err_text = String::from_utf8_lossy(&output.stderr).trim().to_string();

            if !silent {
                // Log everything to terminal for visibility
                if !out_text.is_empty() {
                    let _ = window.emit("scrcpy-log", format!("[ADB] {}", out_text));
                }
                if !err_text.is_empty() {
                    let _ = window.emit("scrcpy-log", format!("[ADB ERROR] {}", err_text));
                }
            }

            let success = output.status.success()
                && !out_text.contains("cannot connect")
                && !out_text.contains("failed");
            Ok(
                json!({ "success": success, "message": if out_text.is_empty() { err_text } else { out_text } }),
            )
        }
        Err(e) => {
            if !silent {
                let _ = window.emit(
                    "scrcpy-log",
                    format!("[SYSTEM] Connection to {} failed: {}.", ip, e),
                );
            }
            Ok(json!({ "success": false, "message": e }))
        }
    }
}

#[tauri::command]
pub async fn adb_pair(
    window: Window,
    ip: String,
    code: String,
    custom_path: Option<String>,
) -> Result<serde_json::Value, String> {
    validate::adb_address(&ip)?;
    let adb_path = get_binary_path("adb", custom_path);
    let _ = window.emit("scrcpy-log", format!("[SYSTEM] Pairing with {}...", ip));

    let mut cmd = create_command(&adb_path);
    cmd.arg("pair").arg(&ip).arg(&code);
    let output = process::output_with_timeout(cmd, Duration::from_secs(10)).await?;

    let out_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let err_text = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !out_text.is_empty() {
        let _ = window.emit("scrcpy-log", format!("[ADB] {}", out_text));
    }
    if !err_text.is_empty() {
        let _ = window.emit("scrcpy-log", format!("[ADB ERROR] {}", err_text));
    }

    let success = output.status.success()
        && (out_text.contains("Successfully paired") || err_text.contains("Successfully paired"));

    Ok(
        json!({ "success": success, "message": if out_text.is_empty() { err_text } else { out_text } }),
    )
}

#[tauri::command]
pub async fn adb_shell(
    device: String,
    command: String,
    custom_path: Option<String>,
) -> serde_json::Value {
    if let Err(e) = validate::device(&device) {
        return json!({ "success": false, "message": e });
    }
    let adb_path = get_binary_path("adb", custom_path);

    let mut cmd = create_command(&adb_path);
    cmd.arg("-s").arg(&device).arg("shell").arg(&command);
    let output = process::output_with_timeout(cmd, Duration::from_secs(10)).await;

    match output {
        Ok(o) => {
            json!({ "success": o.status.success(), "output": String::from_utf8_lossy(&o.stdout).to_string() })
        }
        Err(e) => json!({ "success": false, "message": e.to_string() }),
    }
}

/// The terminal panel renders whatever comes back from the command; a
/// runaway command (adb logcat never exits) must not grow the Rust side
/// without bound. Keep the first 256 KiB and mark the cut.
const MAX_TERMINAL_OUTPUT_BYTES: usize = 256 * 1024;

fn cap_terminal_output(mut text: String) -> String {
    if text.len() <= MAX_TERMINAL_OUTPUT_BYTES {
        return text;
    }
    let mut end = MAX_TERMINAL_OUTPUT_BYTES;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    text.truncate(end);
    text.push_str("\n[output truncated]");
    text
}

#[tauri::command]
pub async fn run_terminal_command(
    device: Option<String>,
    cmd: String,
    custom_path: Option<String>,
) -> serde_json::Value {
    let mut parts = match split_args(&cmd) {
        Ok(parts) => parts,
        Err(e) => return json!({ "success": false, "message": e }),
    };
    if parts.is_empty() {
        return json!({ "success": false, "message": "No command provided" });
    }

    let first_part = parts[0].to_lowercase();
    let is_scrcpy = first_part == "scrcpy";
    let is_adb = first_part == "adb";

    let binary_name = if is_scrcpy { "scrcpy" } else { "adb" };
    let exe_path = get_binary_path(binary_name, custom_path);

    // If they explicitly typed "adb" or "scrcpy", remove it from arguments
    if is_adb || is_scrcpy {
        parts.remove(0);
    }

    let mut args = Vec::new();

    // Auto-inject device ID for ADB/Scrcpy commands if a device is active and not already specified
    let has_serial_flag =
        parts.contains(&"-s".to_string()) || parts.contains(&"--serial".to_string());

    if !has_serial_flag {
        if let Some(ref d) = device {
            if !d.is_empty() {
                if let Err(e) = validate::device(d) {
                    return json!({ "success": false, "message": e });
                }
                // For ADB, don't inject for certain global commands
                let is_global_adb = binary_name == "adb"
                    && !parts.is_empty()
                    && (parts[0] == "devices" || parts[0] == "connect" || parts[0] == "pair");

                if !is_global_adb {
                    args.push("-s".to_string());
                    args.push(d.clone());
                }
            }
        }
    }

    for part in parts {
        args.push(part);
    }

    let mut command = create_command(&exe_path);
    command.args(&args);
    let output = process::output_with_timeout(command, Duration::from_secs(30)).await;

    match output {
        Ok(o) => {
            json!({
                "success": o.status.success(),
                "binary": binary_name,
                "stdout": cap_terminal_output(String::from_utf8_lossy(&o.stdout).to_string()),
                "stderr": cap_terminal_output(String::from_utf8_lossy(&o.stderr).to_string())
            })
        }
        Err(e) => json!({ "success": false, "message": e }),
    }
}

fn split_args(s: &str) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let chars = s.chars();

    for c in chars {
        if c == '"' {
            in_quotes = !in_quotes;
        } else if c.is_whitespace() && !in_quotes {
            if !current.is_empty() {
                args.push(current.clone());
                current.clear();
            }
        } else {
            current.push(c);
        }
    }
    if !current.is_empty() {
        args.push(current);
    }
    if in_quotes {
        return Err("Unclosed quotes".to_string());
    }
    Ok(args)
}

/// Allowlist for release asset file names (used by `download_scrcpy`).
/// Both the API path and the fallback construct this name, but the API path
/// echoes a server-provided string, so it is validated before downloading.
fn is_expected_asset_name(name: &str, extension: &str) -> bool {
    name.starts_with("scrcpy-")
        && name.ends_with(extension)
        && name.len() < 200
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

/// Keep only the final path component of a frontend-provided file name, so a
/// crafted `name` (absolute path or `..` segments) cannot escape the target
/// directory (used by `save_report`).
fn safe_file_name(name: &str) -> Option<String> {
    std::path::Path::new(name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
}

/// Sanitize an arbitrary identifier (e.g. a device id from user-typed IPs or
/// ADB output) for use inside a file name (used for the `--record` filename).
fn sanitize_filename_component(s: &str) -> String {
    let cleaned: String = s
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = cleaned.trim_matches('.');
    if trimmed.is_empty() {
        "device".to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
pub async fn push_file(
    device: String,
    file_path: String,
    custom_path: Option<String>,
) -> serde_json::Value {
    if let Err(e) = validate::device(&device) {
        return json!({ "success": false, "message": e });
    }
    let adb_path = get_binary_path("adb", custom_path);

    let output = create_command(&adb_path)
        .arg("-s")
        .arg(&device)
        .arg("push")
        .arg(&file_path)
        .arg("/sdcard/Download/")
        .output()
        .await;

    match output {
        Ok(o) => {
            if o.status.success() {
                json!({ "success": true, "message": "File pushed to Downloads" })
            } else {
                json!({ "success": false, "message": "Transfer failed" })
            }
        }
        Err(e) => json!({ "success": false, "message": e.to_string() }),
    }
}

#[tauri::command]
pub async fn install_apk(
    device: String,
    file_path: String,
    custom_path: Option<String>,
) -> serde_json::Value {
    if let Err(e) = validate::device(&device) {
        return json!({ "success": false, "message": e });
    }
    let adb_path = get_binary_path("adb", custom_path);

    let output = create_command(&adb_path)
        .arg("-s")
        .arg(&device)
        .arg("install")
        .arg(&file_path)
        .output()
        .await;

    match output {
        Ok(o) => {
            let out_text = String::from_utf8_lossy(&o.stdout);
            let err_text = String::from_utf8_lossy(&o.stderr);

            if o.status.success() {
                json!({ "success": true, "message": out_text.trim() })
            } else {
                json!({ "success": false, "message": err_text.trim() })
            }
        }
        Err(e) => json!({ "success": false, "message": e.to_string() }),
    }
}

#[tauri::command]
pub async fn kill_adb(
    window: Window,
    custom_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let adb_path = get_binary_path("adb", custom_path);
    let _ = window.emit(
        "scrcpy-log",
        "[SYSTEM] Terminating ADB stack...".to_string(),
    );

    let mut cmd = create_command(&adb_path);
    cmd.arg("kill-server");
    match process::output_with_timeout(cmd, Duration::from_secs(5)).await {
        Ok(output) if output.status.success() => {
            let _ = window.emit("scrcpy-log", "[SYSTEM] ADB Stack Terminated.".to_string());
            Ok(json!({ "success": true, "message": "ADB Stack Terminated" }))
        }
        Ok(output) => {
            let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let message = if err.is_empty() {
                "adb kill-server failed".to_string()
            } else {
                err
            };
            let _ = window.emit("scrcpy-log", format!("[ADB ERROR] {message}"));
            Ok(json!({ "success": false, "message": message }))
        }
        Err(e) => Ok(json!({ "success": false, "message": e })),
    }
}

#[tauri::command]
pub async fn list_scrcpy_options(
    device: String,
    arg: String,
    custom_path: Option<String>,
) -> serde_json::Value {
    if let Err(e) = validate::device(&device) {
        return json!({ "success": false, "message": e });
    }
    let exe_path = get_binary_path("scrcpy", custom_path);

    let mut command = create_command(&exe_path);
    command.arg("-s").arg(&device).arg(&arg);

    let output = process::output_with_timeout(command, Duration::from_secs(15)).await;

    match output {
        Ok(o) => {
            let out_text = String::from_utf8_lossy(&o.stdout);
            let err_text = String::from_utf8_lossy(&o.stderr); // scrcpy often prints lists to stderr
            let combined = format!("{}{}", out_text, err_text);
            json!({ "success": o.status.success(), "output": combined })
        }
        Err(e) => json!({ "success": false, "message": e.to_string() }),
    }
}

fn detect_host_os() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        "unknown"
    }
}

fn render_driver_label(driver: &str) -> &'static str {
    match driver {
        "direct3d" => "D3D11 (Direct3D)",
        "opengl" => "OpenGL",
        "opengles2" => "OpenGL ES 2",
        "opengles" => "OpenGL ES",
        "metal" => "Metal",
        "software" => "Software",
        "vulkan" => "Vulkan",
        _ => "Custom",
    }
}

fn is_driver_allowed_on_os(driver: &str, host_os: &str) -> bool {
    match host_os {
        "windows" => driver != "metal",
        "macos" => driver != "direct3d",
        "linux" => driver != "direct3d" && driver != "metal",
        _ => true,
    }
}

fn detect_render_drivers_from_help(help_output: &str) -> Vec<String> {
    let known = [
        "direct3d",
        "opengl",
        "opengles2",
        "opengles",
        "metal",
        "software",
        "vulkan",
    ];

    let lower = help_output.to_lowercase();
    let render_context = if let Some(start) = lower.find("--render-driver") {
        let end = (start + 1600).min(lower.len());
        lower[start..end].to_string()
    } else {
        String::new()
    };

    known
        .iter()
        .filter(|driver| {
            render_context.contains(&format!("\"{}\"", driver))
                || render_context.contains(&format!("'{}'", driver))
                || render_context.contains(*driver)
        })
        .map(|driver| (*driver).to_string())
        .collect()
}

#[tauri::command]
pub async fn get_render_drivers(custom_path: Option<String>) -> serde_json::Value {
    let exe_path = get_binary_path("scrcpy", custom_path);
    let host_os = detect_host_os();

    let mut cmd = create_command(&exe_path);
    cmd.arg("--help");
    let output = process::output_with_timeout(cmd, Duration::from_secs(5)).await;

    match output {
        Ok(o) => {
            let out_text = String::from_utf8_lossy(&o.stdout);
            let err_text = String::from_utf8_lossy(&o.stderr);
            let combined = format!("{}{}", out_text, err_text);
            let lower = combined.to_lowercase();

            let supports_render_driver = lower.contains("--render-driver");
            if !supports_render_driver {
                return json!({
                    "success": true,
                    "hostOs": host_os,
                    "supportsRenderDriver": false,
                    "detectedDrivers": [],
                    "supportedDrivers": [],
                    "diagnostics": "scrcpy does not advertise --render-driver in --help output"
                });
            }

            let detected_drivers = detect_render_drivers_from_help(&combined);
            let supported_drivers: Vec<serde_json::Value> = detected_drivers
                .iter()
                .filter(|driver| is_driver_allowed_on_os(driver, host_os))
                .map(|driver| {
                    json!({
                        "id": driver,
                        "label": render_driver_label(driver)
                    })
                })
                .collect();

            json!({
                "success": o.status.success(),
                "hostOs": host_os,
                "supportsRenderDriver": true,
                "detectedDrivers": detected_drivers,
                "supportedDrivers": supported_drivers,
                "diagnostics": "render drivers parsed from scrcpy --help"
            })
        }
        Err(e) => json!({
            "success": false,
            "hostOs": host_os,
            "supportsRenderDriver": false,
            "detectedDrivers": [],
            "supportedDrivers": [],
            "message": e.to_string()
        }),
    }
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScrcpyConfig {
    device: String,
    session_mode: String,
    // ... other fields matching JS ...
    bitrate: Option<u32>,
    fps: Option<u32>,
    stay_awake: Option<bool>,
    turn_off: Option<bool>,
    audio_enabled: Option<bool>,
    audio_codec: Option<String>,
    always_on_top: Option<bool>,
    fullscreen: Option<bool>,
    borderless: Option<bool>,
    record: Option<bool>,
    record_path: Option<String>,
    scrcpy_path: Option<String>,
    otg_pure: Option<bool>,
    camera_facing: Option<String>,
    camera_id: Option<String>,
    codec: Option<String>,
    camera_ar: Option<String>,
    camera_high_speed: Option<bool>,
    vd_width: Option<u32>,
    vd_height: Option<u32>,
    vd_dpi: Option<u32>,
    rotation: Option<String>,
    res: Option<String>,
    hid_keyboard: Option<bool>,
    hid_mouse: Option<bool>,
    render_driver: Option<String>,
    // v4 features
    flex_display: Option<bool>,
    camera_torch: Option<bool>,
    camera_zoom: Option<f32>,
    background_color: Option<String>,
    keep_active: Option<bool>,
    /// Force SDL renderer VSync on/off (anti-tearing). scrcpy 4.0 (SDL3)
    /// disables renderer VSync by default; this re-asserts it via the SDL hint.
    vsync: Option<bool>,
    /// Last known screen position of the scrcpy mirror window. Captured (client
    /// area top-left) while a windowed session runs and restored via
    /// --window-x / --window-y on the next launch, so the window reopens where
    /// the user left it, including when relaunching borderless.
    window_x: Option<i32>,
    window_y: Option<i32>,
    // v4.1 features
    /// Ignore video encoder size constraints entirely (scrcpy v4.1+).
    /// Useful when the device reports incorrect encoder limits that prevent
    /// scrcpy from starting.
    ignore_video_encoder_constraints: Option<bool>,
    // Mic bridge (audio-only capture source)
    /// Audio source: "mic" (raw) or "voice-communication" (Android-side
    /// noise suppression + AGC + echo cancellation), for Android 12+.
    mic_source: Option<String>,
    /// Lossy codec for the bridge: "opus" (default) or "aac".
    mic_codec: Option<String>,
    /// Bitrate in kbps for the lossy mic codecs (64..256).
    mic_bitrate: Option<u32>,
    /// Experimental: create the virtual sink through a PipeWire RNNoise
    /// filter-chain (PC-side noise suppression). Best effort with fallback.
    mic_denoise: Option<bool>,
}

fn resolve_audio_codec_flag<'a>(
    config: &'a ScrcpyConfig,
    audio_codec_override: Option<&'a str>,
) -> Option<&'a str> {
    if let Some(c) = audio_codec_override {
        let trimmed = c.trim();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    config.audio_codec.as_deref().and_then(|c| {
        let trimmed = c.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("auto") {
            None
        } else {
            Some(trimmed)
        }
    })
}

/// Parses `KEY=value` shell output (as printed by `xdotool ... --shell`) and
/// returns the integer value for `key`. Only compiled where it is used (the
/// Linux capture path, and the unit tests).
#[cfg(any(test, target_os = "linux"))]
fn parse_shell_var_int(text: &str, key: &str) -> Option<i32> {
    let prefix = format!("{}=", key);
    text.lines()
        .find(|l| l.starts_with(&prefix))
        .and_then(|l| l[prefix.len()..].trim().parse().ok())
}

/// Windows: finds the first visible, unowned top-level window belonging to
/// process `pid` (matches .NET's `MainWindowHandle` heuristic), i.e. scrcpy's
/// SDL mirror window rather than some owned tool/popup window. Shared by the
/// position-capture and recenter paths so both agree on which window they
/// mean.
#[cfg(target_os = "windows")]
fn find_window_by_pid(pid: u32) -> Option<windows::Win32::Foundation::HWND> {
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindow, GetWindowThreadProcessId, IsWindowVisible, GW_OWNER,
    };

    // State threaded through EnumWindows via LPARAM.
    struct Search {
        target_pid: u32,
        found: HWND,
    }

    // WNDENUMPROC: BOOL(1) keeps enumerating, BOOL(0) stops.
    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let search = &mut *(lparam.0 as *mut Search);
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }
        if GetWindow(hwnd, GW_OWNER)
            .map(|o| !o.0.is_null())
            .unwrap_or(false)
        {
            return BOOL(1);
        }
        let mut wnd_pid: u32 = 0;
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut wnd_pid as *mut u32));
        if wnd_pid == search.target_pid {
            search.found = hwnd;
            return BOOL(0); // found it -> stop enumeration
        }
        BOOL(1)
    }

    let mut search = Search {
        target_pid: pid,
        found: HWND::default(),
    };
    // EnumWindows returns Err both on real failure and when the callback
    // returns BOOL(0) (our intentional early stop), so ignore the Result and
    // read the captured handle instead.
    unsafe {
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut search as *mut Search as isize));
    }
    (!search.found.0.is_null()).then_some(search.found)
}

/// Queries the on-screen position of the scrcpy SDL window owned by process
/// `pid`, returning the client-area top-left in screen pixels. Returns `None`
/// silently whenever the window can't be read (not created yet, minimized,
/// tooling missing, permission denied); every failure mode is non-fatal.
///
/// The reference frame differs per platform and is reconciled afterwards by
/// [`resolve_window_pos_to_persist`], rather than by hardcoding decoration
/// sizes:
/// - Windows: Win32 `ClientToScreen` -> client origin (matches scrcpy/SDL).
/// - Linux/X11 (+XWayland): `xdotool` -> window origin (usually the client area).
/// - macOS: `osascript`/System Events -> frame origin (title-bar top).
fn try_capture_window_pos(pid: u32) -> Option<(i32, i32)> {
    #[cfg(target_os = "windows")]
    {
        // Native Win32: this replaces spawning PowerShell + `Add-Type` (a C#
        // JIT) on every poll, it is a couple of direct syscalls with no child
        // process.
        use windows::Win32::Foundation::POINT;
        use windows::Win32::Graphics::Gdi::ClientToScreen;
        use windows::Win32::UI::WindowsAndMessaging::{IsIconic, IsZoomed};

        if let Some(hwnd) = find_window_by_pid(pid) {
            // A minimized window reports an off-screen sentinel origin
            // (~ -32000,-32000) and a maximized one the monitor edge; neither is
            // the windowed position we want, so skip them and keep the last good
            // sample.
            let special = unsafe { IsIconic(hwnd).as_bool() || IsZoomed(hwnd).as_bool() };
            if !special {
                // ClientToScreen maps the client-area origin (0,0) into screen
                // pixels; GetWindowRect would return the outer frame and creep
                // the window up by the title-bar height on every relaunch.
                let mut pt = POINT { x: 0, y: 0 };
                if unsafe { ClientToScreen(hwnd, &mut pt) }.as_bool() {
                    return Some((pt.x, pt.y));
                }
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        let pid_str = pid.to_string();
        let output = StdCommand::new("xdotool")
            .args(["search", "--pid", &pid_str, "getwindowgeometry", "--shell"])
            .output()
            .ok()?;
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            let x = parse_shell_var_int(&text, "X")?;
            let y = parse_shell_var_int(&text, "Y")?;
            return Some((x, y));
        }
    }
    #[cfg(target_os = "macos")]
    {
        // System Events needs Accessibility permission for the app (one-time
        // grant in System Settings). The try block swallows every error (no
        // window yet, permission denied, ...) so this stays a silent no-op
        // until the permission is granted.
        let script = format!(
            concat!(
                "tell application \"System Events\"\n",
                "try\n",
                "set proc to first process whose unix id is {}\n",
                "set pos to position of first window of proc\n",
                "((item 1 of pos) as string) & \" \" & ((item 2 of pos) as string)\n",
                "end try\n",
                "end tell"
            ),
            pid
        );
        let output = StdCommand::new("osascript")
            .args(["-e", &script])
            .output()
            .ok()?;
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            let mut parts = text.split_whitespace();
            let x: i32 = parts.next()?.parse().ok()?;
            let y: i32 = parts.next()?.parse().ok()?;
            return Some((x, y));
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    let _ = pid;
    None
}

/// Moves the scrcpy mirror window owned by `pid` to the centre of the primary
/// screen and brings it to the front. A safety net for a persisted position
/// that no longer lands on any connected monitor (e.g. it was saved while a
/// second monitor was attached, which has since been unplugged) -- the window
/// can reopen fully off-screen, with no title bar to drag back if borderless.
/// Best-effort and silent: does nothing if the window can't be found, is
/// already maximized (it fills its monitor; there is nothing to recover), or
/// the move fails.
fn recenter_window(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::RECT;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetSystemMetrics, GetWindowRect, IsIconic, IsZoomed, SetForegroundWindow, SetWindowPos,
            ShowWindow, SM_CXSCREEN, SM_CYSCREEN, SWP_NOSIZE, SWP_NOZORDER, SW_RESTORE,
        };

        let Some(hwnd) = find_window_by_pid(pid) else {
            return;
        };
        if unsafe { IsZoomed(hwnd) }.as_bool() {
            return;
        }
        if unsafe { IsIconic(hwnd) }.as_bool() {
            let _ = unsafe { ShowWindow(hwnd, SW_RESTORE) };
        }
        let mut rect = RECT::default();
        if unsafe { GetWindowRect(hwnd, &mut rect) }.is_err() {
            return;
        }
        let (w, h) = (rect.right - rect.left, rect.bottom - rect.top);
        let (screen_w, screen_h) =
            unsafe { (GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN)) };
        let _ = unsafe {
            SetWindowPos(
                hwnd,
                None,
                (screen_w - w) / 2,
                (screen_h - h) / 2,
                0,
                0,
                SWP_NOSIZE | SWP_NOZORDER,
            )
        };
        let _ = unsafe { SetForegroundWindow(hwnd) };
    }
    #[cfg(target_os = "linux")]
    {
        let pid_str = pid.to_string();
        let Ok(search_out) = StdCommand::new("xdotool")
            .args(["search", "--pid", &pid_str])
            .output()
        else {
            return;
        };
        let Some(window_id) = String::from_utf8_lossy(&search_out.stdout)
            .lines()
            .next()
            .map(str::to_string)
        else {
            return;
        };

        let Ok(geom_out) = StdCommand::new("xdotool")
            .args(["getwindowgeometry", "--shell", &window_id])
            .output()
        else {
            return;
        };
        let geom_text = String::from_utf8_lossy(&geom_out.stdout);
        let (Some(w), Some(h)) = (
            parse_shell_var_int(&geom_text, "WIDTH"),
            parse_shell_var_int(&geom_text, "HEIGHT"),
        ) else {
            return;
        };

        let Ok(display_out) = StdCommand::new("xdotool")
            .arg("getdisplaygeometry")
            .output()
        else {
            return;
        };
        let display_text = String::from_utf8_lossy(&display_out.stdout);
        let mut parts = display_text.split_whitespace();
        let (Some(Ok(screen_w)), Some(Ok(screen_h))) = (
            parts.next().map(str::parse::<i32>),
            parts.next().map(str::parse::<i32>),
        ) else {
            return;
        };

        let x = ((screen_w - w).max(0) / 2).to_string();
        let y = ((screen_h - h).max(0) / 2).to_string();
        let _ = StdCommand::new("xdotool")
            .args(["windowmove", &window_id, &x, &y])
            .output();
        let _ = StdCommand::new("xdotool")
            .args(["windowactivate", &window_id])
            .output();
    }
    #[cfg(target_os = "macos")]
    {
        // Same Accessibility-permission requirement as the position capture
        // above; a silent no-op until it is granted.
        let script = format!(
            concat!(
                "tell application \"System Events\"\n",
                "try\n",
                "set proc to first process whose unix id is {}\n",
                "set win to first window of proc\n",
                "set {{winW, winH}} to size of win\n",
                "tell application \"Finder\" to set screenBounds to bounds of window of desktop\n",
                "set screenW to (item 3 of screenBounds)\n",
                "set screenH to (item 4 of screenBounds)\n",
                "set position of win to {{((screenW - winW) / 2), ((screenH - winH) / 2)}}\n",
                "set frontmost of proc to true\n",
                "end try\n",
                "end tell"
            ),
            pid
        );
        let _ = StdCommand::new("osascript").args(["-e", &script]).output();
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    let _ = pid;
}

/// Re-centres the running mirror window for `device` on the primary screen.
/// Bound to a global OS shortcut (Ctrl+Alt+Shift+C, see `shortcuts.rs`) so a
/// window whose saved position ends up off-screen (see [`recenter_window`])
/// can be recovered without being able to see or focus it directly. A no-op
/// if `device` has no tracked process (e.g. nothing is running).
pub fn recenter_device(state: &ScrcpyState, device: &str) {
    let pid = state
        .sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(device)
        .map(|s| s.pid.load(Ordering::Relaxed))
        .filter(|pid| *pid != 0);
    if let Some(pid) = pid {
        recenter_window(pid);
    }
}

#[tauri::command]
pub fn recenter_scrcpy_window(state: State<'_, ScrcpyState>, device: String) -> Result<(), String> {
    recenter_device(&state, &device);
    Ok(())
}

/// Records which device the GUI currently considers selected, so the global
/// recentre shortcut (which fires with no window necessarily focused) knows
/// which mirror window to act on.
#[tauri::command]
pub fn set_active_device(
    state: State<'_, ScrcpyState>,
    device: Option<String>,
) -> Result<(), String> {
    *state
        .active_device
        .lock()
        .unwrap_or_else(|e| e.into_inner()) = device;
    Ok(())
}

/// Converts a raw captured position into the value to persist as
/// --window-x/--window-y so the window round-trips exactly on the next launch.
///
/// [`try_capture_window_pos`] reports coordinates in each OS tool's native
/// frame, which may differ from scrcpy's own (SDL) reference by the window
/// decorations, a difference that varies by platform, window manager, theme
/// and SDL version. Instead of hardcoding decoration sizes we learn the offset
/// live: when we launched at an explicit position (`requested`), the delta
/// between it and the *first* sample (`first`, taken before the user can move
/// the window) is the decoration offset; subtracting it from the last sample
/// yields a value that round-trips. Offsets larger than any plausible window
/// decoration are ignored (the window was moved before the first sample, or was
/// placed by the WM), falling back to the raw `last` position.
fn resolve_window_pos_to_persist(
    requested: Option<(i32, i32)>,
    first: Option<(i32, i32)>,
    last: (i32, i32),
) -> (i32, i32) {
    if let (Some((rx, ry)), Some((fx, fy))) = (requested, first) {
        let (dx, dy) = (fx - rx, fy - ry);
        if dx.abs() <= 80 && dy.abs() <= 120 {
            return (last.0 - dx, last.1 - dy);
        }
    }
    last
}

/// Emits the resolved window position (when one was captured) followed by the
/// session-stopped status. Shared by every monitor-loop exit path.
fn emit_window_pos_and_stop(
    window: &Window,
    device: &str,
    requested: Option<(i32, i32)>,
    first: Option<(i32, i32)>,
    last: Option<(i32, i32)>,
) {
    if let Some(last) = last {
        let (x, y) = resolve_window_pos_to_persist(requested, first, last);
        let _ = window.emit(
            "scrcpy-window-pos",
            json!({ "device": device, "x": x, "y": y }),
        );
    }
    let _ = window.emit(
        "scrcpy-status",
        json!({ "device": device, "running": false }),
    );
}

fn build_scrcpy_args(
    config: &ScrcpyConfig,
    video_dir_fallback: Option<String>,
    audio_codec_override: Option<&str>,
) -> Vec<String> {
    let mut args = Vec::new();

    // Construct arguments based on config
    if !config.device.is_empty() {
        args.push("-s".to_string());
        args.push(config.device.clone());
    }

    let codec = config.codec.as_deref().unwrap_or("h264");
    args.push(format!("--video-codec={}", codec));

    let otg_pure = config.otg_pure.unwrap_or(false);
    let hid_keyboard = config.hid_keyboard.unwrap_or(false);
    let hid_mouse = config.hid_mouse.unwrap_or(false);

    if config.session_mode == "mirror" && (hid_keyboard || hid_mouse) && otg_pure {
        if config.device.contains('.') || config.device.contains(':') {
            args.push("--no-video".to_string());
            args.push("--no-audio".to_string());
            args.push("--keyboard=uhid".to_string());
            args.push("--mouse=uhid".to_string());
        } else {
            args.push("--otg".to_string());
        }
    } else {
        if config.session_mode == "mic" {
            // Audio-only bridge: the phone's mic reaches the PC as a
            // recording device, with no video pipeline and no window. Every
            // video-specific knob below is irrelevant here, so this branch
            // builds a minimal set and returns early.
            args.push("--no-window".to_string());
            args.push("--no-video".to_string());
            let source = config.mic_source.as_deref().unwrap_or("").trim();
            let source = if source.is_empty() { "mic" } else { source };
            args.push(format!("--audio-source={}", source));
            // The bridge has its own codec choice; the automatic repair
            // chain's override (when present) still wins so recovery can try
            // alternatives after a codec failure.
            let codec = audio_codec_override
                .map(str::trim)
                .filter(|c| !c.is_empty())
                .map(str::to_string)
                .or_else(|| {
                    config
                        .mic_codec
                        .as_deref()
                        .map(str::trim)
                        .filter(|c| !c.is_empty())
                        .map(str::to_string)
                })
                .unwrap_or_else(|| "opus".to_string());
            args.push(format!("--audio-codec={}", codec));
            if codec == "opus" || codec == "aac" {
                let kbps = config.mic_bitrate.unwrap_or(128).clamp(32, 256);
                args.push(format!("--audio-bit-rate={}k", kbps));
            }
            return args;
        }
        if hid_keyboard {
            args.push("--keyboard=uhid".to_string());
        }
        if hid_mouse {
            args.push("--mouse=uhid".to_string());
        }

        if let Some(render_driver) = &config.render_driver {
            let selected_driver = render_driver.trim();
            if !selected_driver.is_empty() && selected_driver != "auto" {
                args.push("--render-driver".to_string());
                args.push(selected_driver.to_string());
            }
        }

        if let Some(bitrate) = config.bitrate {
            args.push("--video-bit-rate".to_string());
            args.push(format!("{}M", bitrate));
        }

        let audio_enabled = config.audio_enabled.unwrap_or(true);
        if !audio_enabled {
            args.push("--no-audio".to_string());
        }
        if audio_enabled {
            if let Some(codec) = resolve_audio_codec_flag(config, audio_codec_override) {
                args.push(format!("--audio-codec={}", codec));
            }
        }
        if let Some(aot) = config.always_on_top {
            if aot {
                args.push("--always-on-top".to_string());
            }
        }
        if let Some(fs) = config.fullscreen {
            if fs {
                args.push("--fullscreen".to_string());
            }
        }
        if let Some(bl) = config.borderless {
            if bl {
                args.push("--window-borderless".to_string());
            }
        }

        // Restore the last saved window position (client-area origin), for
        // mirror sessions only. Skipped in fullscreen (scrcpy ignores it) and
        // for camera/desktop, whose windows must not share, or overwrite, the
        // mirror window's remembered position.
        if config.session_mode == "mirror" && !config.fullscreen.unwrap_or(false) {
            if let Some(wx) = config.window_x {
                args.push(format!("--window-x={}", wx));
            }
            if let Some(wy) = config.window_y {
                args.push(format!("--window-y={}", wy));
            }
        }

        if let Some(rot) = &config.rotation {
            if rot != "0" {
                args.push("--orientation".to_string());
                args.push(rot.clone());
            }
        }

        let can_control = config.session_mode != "camera";
        if can_control {
            if let Some(sa) = config.stay_awake {
                if sa {
                    args.push("--stay-awake".to_string());
                }
            }
            if let Some(ka) = config.keep_active {
                if ka {
                    args.push("--keep-active".to_string());
                }
            }
            if let Some(to) = config.turn_off {
                if to {
                    args.push("--turn-screen-off".to_string());
                    args.push("--no-power-on".to_string());
                }
            }
        }

        if config.session_mode == "camera" {
            args.push("--video-source=camera".to_string());
            if let Some(cid) = &config.camera_id {
                if !cid.is_empty() {
                    args.push(format!("--camera-id={}", cid));
                } else if let Some(facing) = &config.camera_facing {
                    args.push(format!("--camera-facing={}", facing));
                }
            } else if let Some(facing) = &config.camera_facing {
                args.push(format!("--camera-facing={}", facing));
            }

            // Resolution logic: Map res (e.g., "1920") to standard camera sizes (e.g., "1920x1080")
            if let Some(res) = &config.res {
                if res != "0" {
                    let camera_size = match res.as_str() {
                        "3840" => "3840x2160",
                        "2560" => "2560x1440",
                        "1920" => "1920x1080",
                        "1600" => "1600x900",
                        "1280" => "1280x720",
                        "1024" => "1024x576",
                        "800" => "800x480",
                        _ => "1920x1080",
                    };
                    args.push(format!("--camera-size={}", camera_size));
                } else {
                    // Safe fallback default to avoid camera configuration error on non-standard sensor photo sizes (e.g. 4080x3060)
                    args.push("--camera-size=1920x1080".to_string());
                }
            } else {
                args.push("--camera-size=1920x1080".to_string());
            }

            if let Some(ar) = &config.camera_ar {
                if ar != "0" {
                    args.push(format!("--camera-ar={}", ar));
                }
            }
            if let Some(chs) = config.camera_high_speed {
                if chs {
                    args.push("--camera-high-speed".to_string());
                }
            }
            // v4: camera torch and zoom
            if let Some(true) = config.camera_torch {
                args.push("--camera-torch".to_string());
            }
            if let Some(zoom) = config.camera_zoom {
                if zoom > 1.005 {
                    // avoid floating point noise at 1.0
                    args.push(format!("--camera-zoom={:.1}", zoom));
                }
            }
            // fps handled generically below
        } else if config.session_mode == "desktop" {
            let w = config.vd_width.unwrap_or(1920);
            let h = config.vd_height.unwrap_or(1080);
            let dpi = config.vd_dpi.unwrap_or(420);
            args.push(format!("--new-display={}x{}/{}", w, h, dpi));
            args.push("--video-buffer=100".to_string());
            // v4: flex display (resize virtual display with window)
            if let Some(true) = config.flex_display {
                args.push("--flex-display".to_string());
            }
        }

        if let Some(fps) = config.fps {
            if fps > 0 {
                if config.session_mode == "camera" {
                    args.push("--camera-fps".to_string());
                } else {
                    args.push("--max-fps".to_string());
                }
                args.push(fps.to_string());
            }
        } else if config.session_mode == "camera" && config.camera_high_speed.unwrap_or(false) {
            args.push("--camera-fps".to_string());
            args.push("60".to_string());
        }

        // Shared resolution logic (applies to mirror and desktop)
        if config.session_mode != "camera" {
            if let Some(res) = &config.res {
                if res != "0" {
                    args.push("--max-size".to_string());
                    args.push(res.clone());
                }
            }
        }

        if let Some(rec) = config.record {
            if rec {
                let mut path = config.record_path.clone().unwrap_or_default();

                // If path is empty, try to get Video dir fallback
                if path.trim().is_empty() {
                    path = video_dir_fallback.unwrap_or_else(|| ".".to_string());
                }

                // The device id can come from user-typed IPs or ADB output,
                // so sanitize it before using it inside a file name.
                let safe_device = sanitize_filename_component(&config.device);
                let filename = format!(
                    "scrcpy_{}_{}.mkv",
                    safe_device,
                    chrono::Local::now().format("%Y%m%d_%H%M%S")
                );
                let full_path = std::path::Path::new(&path).join(filename);
                args.push(format!("--record={}", full_path.to_string_lossy()));
            }
        }

        // v4: background color (all modes)
        if let Some(ref color) = config.background_color {
            let trimmed = color.trim();
            if !trimmed.is_empty() {
                args.push(format!("--background-color={}", trimmed));
            }
        }

        // v4.1: ignore video encoder size constraints
        if let Some(true) = config.ignore_video_encoder_constraints {
            args.push("--ignore-video-encoder-constraints".to_string());
        }
    }

    args
}

async fn spawn_scrcpy_streams(
    window: &Window,
    exe_path: &str,
    adb_exe_path: &str,
    server_path: Option<&str>,
    args: &[String],
    vsync: bool,
    pulse_sink: Option<&str>,
) -> Result<(tokio::process::Child, Arc<AtomicBool>), String> {
    let command_str = format!("> scrcpy {}", args.join(" "));
    let _ = window.emit("scrcpy-log", command_str);

    let mut command = create_command(exe_path);
    command.args(args);
    command.env("ADB", adb_exe_path);
    // Mic bridge on Linux: libpulse honours PULSE_SINK as the client's
    // default output, which lands scrcpy's stream inside our virtual sink.
    if let Some(sink) = pulse_sink {
        command.env("PULSE_SINK", sink);
    }
    if let Some(sp) = server_path {
        if Path::new(sp).exists() {
            command.env("SCRCPY_SERVER_PATH", sp);
        }
    }
    // scrcpy 4.0 migrated from SDL2 to SDL3, which leaves the renderer's VSync
    // disabled by default and reintroduced screen tearing for users who had
    // none on scrcpy 3.x (SDL2). Re-assert VSync through SDL's hint env var so
    // the renderer syncs to the display refresh; "0" lets the user opt out
    // (slightly lower input latency) via the in-app toggle.
    command.env("SDL_RENDER_VSYNC", if vsync { "1" } else { "0" });
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let mut child = command.spawn().map_err(|e| e.to_string())?;

    // Both streams are piped just above, so take() cannot be None here.
    let stdout = child.stdout.take().expect("Failed to capture stdout");
    let stderr = child.stderr.take().expect("Failed to capture stderr");

    let audio_error_flag = Arc::new(AtomicBool::new(false));

    let window_stdout = window.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut buffer = Vec::new();
        let mut interval = tokio::time::interval(Duration::from_millis(100));

        loop {
            tokio::select! {
                line_res = lines.next_line() => {
                    match line_res {
                        Ok(Some(line)) => buffer.push(line),
                        Ok(None) => break,
                        Err(_) => break,
                    }
                }
                _ = interval.tick() => {
                    if !buffer.is_empty() {
                        let combined = buffer.join("\n");
                        let _ = window_stdout.emit("scrcpy-log", combined);
                        buffer.clear();
                    }
                }
            }
        }
        if !buffer.is_empty() {
            let _ = window_stdout.emit("scrcpy-log", buffer.join("\n"));
        }
    });

    let window_stderr = window.clone();
    let flag_clone = audio_error_flag.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        let mut buffer = Vec::new();
        let mut interval = tokio::time::interval(Duration::from_millis(100));

        loop {
            tokio::select! {
                line_res = lines.next_line() => {
                    match line_res {
                        Ok(Some(line)) => {
                            if is_audio_codec_error(&line) {
                                flag_clone.store(true, Ordering::SeqCst);
                            }
                            buffer.push(line);
                        }
                        Ok(None) => break,
                        Err(_) => break,
                    }
                }
                _ = interval.tick() => {
                    if !buffer.is_empty() {
                        let combined = buffer.join("\n");
                        let _ = window_stderr.emit("scrcpy-log", combined);
                        buffer.clear();
                    }
                }
            }
        }
        if !buffer.is_empty() {
            let _ = window_stderr.emit("scrcpy-log", buffer.join("\n"));
        }
    });

    Ok((child, audio_error_flag))
}

enum AttemptOutcome {
    Exited(String),
    WaitError(String),
}

/// Asks the child to exit, waits `grace`, then forces it. Returns whether the
/// graceful path was enough.
async fn terminate_child(child: &mut tokio::process::Child, grace: Duration) -> bool {
    #[cfg(target_os = "windows")]
    if let Some(pid) = child.id() {
        let _ = StdCommand::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    if let Some(pid) = child.id() {
        let _ = StdCommand::new("kill").arg(pid.to_string()).output();
    }

    match tokio::time::timeout(grace, child.wait()).await {
        Ok(Ok(_)) => true,
        Ok(Err(_)) | Err(_) => {
            let _ = child.start_kill();
            let _ = child.wait().await;
            false
        }
    }
}

/// Last-resort kill used when the monitor task cannot run or misses the
/// deadline. SIGKILL/TerminateProcess cannot be ignored, so no wait is needed.
fn force_kill_pid(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        let _ = StdCommand::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = StdCommand::new("kill")
            .args(["-9", &pid.to_string()])
            .output();
    }
}

// ── Microphone bridge helpers (Linux / PipeWire-PulseAudio) ─────────
// For the phone mic to become a *recording device* on the PC, we create a
// dedicated null sink ("OpenScrcpy Mic"): scrcpy's stream plays into it and
// the sink's monitor shows up to every app as a microphone input. The sink
// is service-owned: created at bridge start, unloaded when nothing uses it.
#[cfg(unix)]
const MIC_SINK_NAME: &str = "openscrcpy_mic";
#[cfg(unix)]
const MIC_SINK_LABEL: &str = "OpenScrcpy Mic";

#[cfg(unix)]
struct PactlOut {
    ok: bool,
    stdout: String,
    stderr: String,
}

#[cfg(unix)]
async fn pactl_run(args: &[&str]) -> Option<PactlOut> {
    let mut cmd = create_command("pactl");
    cmd.args(args);
    let output = process::output_with_timeout(cmd, Duration::from_secs(4))
        .await
        .ok()?;
    Some(PactlOut {
        ok: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

// Returns true when the virtual sink exists (created now, if absent).
// With mic_denoise (experimental) the sink is born from a PipeWire RNNoise
// filter-chain, so apps recording its monitor pick up suppressed noise.
#[cfg(unix)]
async fn ensure_mic_sink(window: &Window, denoise: bool) -> bool {
    let Some(sinks) = pactl_run(&["list", "short", "sinks"]).await else {
        let _ = window.emit(
            "scrcpy-log",
            "[MIC] pactl not found; routing skipped (audio goes to the default output)."
                .to_string(),
        );
        return false;
    };
    if sinks
        .stdout
        .lines()
        .any(|l| l.split('\t').nth(1) == Some(MIC_SINK_NAME))
    {
        let _ = window.emit(
            "scrcpy-log",
            "[MIC] Virtual sink OpenScrcpy Mic already loaded.".to_string(),
        );
        return true;
    }

    if denoise {
        // RNNoise ships with PipeWire's example filter-chain configs; try the
        // known install paths before falling back to the plain sink.
        let candidates = [
            "/usr/share/pipewire/filter-chain/sink-rnnoise.conf",
            "/usr/share/pipewire/filter-chain/rnnoise-sink.conf",
        ];
        match candidates.iter().find(|p| Path::new(p).exists()) {
            Some(conf) => {
                let load = pactl_run(&[
                    "load-module",
                    "module-filter-chain",
                    &format!("x={}", conf),
                    &format!("sink_name={}", MIC_SINK_NAME),
                    &format!("sink_properties=device.description=\"{}\"", MIC_SINK_LABEL),
                ])
                .await;
                match load {
                    Some(o) if o.ok => {
                        let _ = window.emit(
                            "scrcpy-log",
                            format!(
                                "[MIC] Noise-suppressed sink \"OpenScrcpy Mic\" created (RNNoise: {}).",
                                conf
                            ),
                        );
                        return true;
                    }
                    Some(o) => {
                        let _ = window.emit(
                            "scrcpy-log",
                            format!("[MIC] RNNoise sink rejected by PipeWire: {}.", o.stderr),
                        );
                    }
                    None => {
                        let _ = window.emit(
                            "scrcpy-log",
                            "[MIC] RNNoise sink failed to load; trying the plain sink.".to_string(),
                        );
                    }
                }
            }
            None => {
                let _ = window.emit(
                    "scrcpy-log",
                    "[MIC] RNNoise filter-chain file not found; using the unfiltered sink."
                        .to_string(),
                );
            }
        }
    }

    let created = pactl_run(&[
        "load-module",
        "module-null-sink",
        &format!("sink_name={}", MIC_SINK_NAME),
        &format!("sink_properties=device.description=\"{}\"", MIC_SINK_LABEL),
    ])
    .await;
    match created {
        Some(o) if o.ok => {
            let _ = window.emit(
                "scrcpy-log",
                format!(
                    "[MIC] Virtual sink \"{}\" created — pick it as the microphone in Discord/OBS/Recorder.",
                    MIC_SINK_LABEL
                ),
            );
            true
        }
        Some(o) => {
            let _ = window.emit(
                "scrcpy-log",
                format!("[MIC] Could not create the virtual sink: {}.", o.stderr),
            );
            false
        }
        None => {
            let _ = window.emit(
                "scrcpy-log",
                "[MIC] Could not create the virtual sink; audio goes to the default output."
                    .to_string(),
            );
            false
        }
    }
}

#[cfg(unix)]
async fn unload_mic_sink(window: &Window) {
    let Some(sinks) = pactl_run(&["list", "short", "sinks"]).await else {
        return;
    };
    if !sinks
        .stdout
        .lines()
        .any(|l| l.split('\t').nth(1) == Some(MIC_SINK_NAME))
    {
        return;
    }
    let Some(modules) = pactl_run(&["list", "short", "modules"]).await else {
        return;
    };
    let module_idx = modules
        .stdout
        .lines()
        .find(|l| l.contains(&format!("sink_name={}", MIC_SINK_NAME)))
        .and_then(|l| l.split('\t').next().map(str::to_string));
    if let Some(idx) = module_idx {
        let _ = pactl_run(&["unload-module", &idx]).await;
        let _ = window.emit(
            "scrcpy-log",
            "[MIC] Virtual sink unloaded (bridge stopped).".to_string(),
        );
    }
}

// Watcher that keeps the scrcpy stream inside the virtual sink for the
// whole session and reports the current destination to the GUI. PULSE_SINK
// does not reach SDL3 clients and the stream shows up only after scrcpy's
// server handshake (seconds later), so a one-shot check is not enough.
/// Bump the logical session generation for a device. run_scrcpy calls this
/// before replacing a previous process, so sidecars spawned for the old
/// session can see they are stale even when the registry key is re-occupied
/// by the replacement before their next liveness check.
#[cfg_attr(not(unix), allow(dead_code))]
fn bump_session_generation(generations: &mut HashMap<String, u64>, device: &str) -> u64 {
    let generation = generations.entry(device.to_string()).or_insert(0);
    *generation += 1;
    *generation
}

#[cfg_attr(not(unix), allow(dead_code))]
fn session_generation_is_current(
    generations: &HashMap<String, u64>,
    device: &str,
    generation: u64,
) -> bool {
    generations.get(device) == Some(&generation)
}

/// Sidecar liveness: the device is still registered AND the generation this
/// loop was spawned with is still the current one. Both locks are taken one
/// after the other, never together, so this cannot deadlock with the
/// run_scrcpy paths (which also never hold both at once).
#[cfg_attr(not(unix), allow(dead_code))]
fn session_alive(app_handle: &tauri::AppHandle, device: &str, generation: u64) -> bool {
    let state = app_handle.state::<ScrcpyState>();
    let in_registry = state
        .sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .contains_key(device);
    if !in_registry {
        return false;
    }
    let generations = state
        .session_generations
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    session_generation_is_current(&generations, device, generation)
}

#[cfg(unix)]
async fn spawn_mic_route_watcher(
    window: Window,
    device: String,
    app_handle: tauri::AppHandle,
    generation: u64,
) {
    tokio::spawn(async move {
        let mut attempts: u32 = 0;
        // Route state of the latest poll we saw (None = nothing yet): drives
        // the pacing exactly like the change-only version did, without
        // gating the emit.
        let mut last_routed: Option<bool> = None;
        loop {
            if !session_alive(&app_handle, &device, generation) {
                break;
            }
            attempts += 1;
            if let Some((display, routed)) = poll_mic_route(&window).await {
                last_routed = Some(routed);
                // Emit every pass instead of only on change: the GUI only
                // subscribes while the mic tab is mounted, so a remounted tab
                // would otherwise stay without destination info until the
                // route actually changes. Traffic stays ~2 events/s at worst,
                // and the frontend just updates two display rows.
                let _ = window.emit("mic-route", (display, routed));
            }
            // Fast cadence while hunting the fresh stream (the handshake
            // lands in ~1.3s) or while a routed stream is MIA (<10 attempts),
            // slow down once healthy or after the hunt window closes.
            let steady = last_routed == Some(true) || attempts > 10;
            if steady {
                tokio::time::sleep(Duration::from_millis(2000)).await;
            } else {
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
        }
    });
}

// One routing pass. Returns the destination for the GUI: (text, in_virtual)
// where empty text means "no scrcpy stream yet". Maintains the route when the
// stream landed on some other output.
#[cfg(unix)]
async fn poll_mic_route(window: &Window) -> Option<(String, bool)> {
    // Verbose sinks: entries start at "Sink #N" and carry Name/Description.
    let mut sink_map: std::collections::HashMap<String, (String, String)> =
        std::collections::HashMap::new();
    let sinks = pactl_run(&["list", "sinks"]).await?;
    for block in sinks.stdout.split("Sink #").skip(1) {
        let idx = block.lines().next().unwrap_or("").trim().to_string();
        if idx.is_empty() {
            continue;
        }
        let name = block
            .lines()
            .find(|l| l.trim().starts_with("Name: "))
            .and_then(|l| l.split_once("Name: ").map(|(_, v)| v.trim().to_string()));
        let desc = block
            .lines()
            .find(|l| l.trim().starts_with("Description: "))
            .and_then(|l| {
                l.split_once("Description: ")
                    .map(|(_, v)| v.trim().to_string())
            });
        if let Some(name) = name {
            sink_map.insert(idx, (name, desc.unwrap_or_default()));
        }
    }
    let (target_idx, _) = sink_map
        .iter()
        .find(|(_, (name, _))| name == MIC_SINK_NAME)
        .map(|(k, v)| (k.clone(), v.1.clone()))?;

    let inputs = pactl_run(&["list", "sink-inputs"]).await?;
    for block in inputs.stdout.split("\n\n") {
        let is_scrcpy = block
            .lines()
            .any(|l| l.trim().starts_with("application.name = \"scrcpy\""));
        if !is_scrcpy {
            continue;
        }
        // move-sink-input takes the CLIENT (stream) index first, then the
        // sink. Stream index lives in the block header: "Sink Input #1340".
        let stream_idx = block
            .lines()
            .next()
            .and_then(|l| l.trim().strip_prefix("Sink Input #"))
            .map(|v| v.trim().to_string());
        let current_idx = block
            .lines()
            .find(|l| l.trim().starts_with("Sink: "))
            .and_then(|l| l.split(':').nth(1).map(|v| v.trim().to_string()));
        let Some(stream_idx) = stream_idx else {
            return Some((String::new(), false));
        };
        let Some(current_idx) = current_idx else {
            return Some((String::new(), false));
        };
        let (cur_name, cur_desc) = sink_map
            .get(&current_idx)
            .cloned()
            .unwrap_or_else(|| (String::new(), String::new()));

        if cur_name == MIC_SINK_NAME {
            return Some((MIC_SINK_LABEL.to_string(), true));
        }
        // The stream went somewhere else: bring it into the virtual sink.
        let moved = pactl_run(&["move-sink-input", &stream_idx, &target_idx]).await;
        let ok = moved.as_ref().map(|m| m.ok).unwrap_or(false);
        let _ = window.emit(
            "scrcpy-log",
            if ok {
                "[MIC] Audio stream moved into the virtual sink.".to_string()
            } else {
                format!(
                    "[MIC] move-sink-input failed: {}.",
                    moved.map(|m| m.stderr).unwrap_or_default()
                )
            },
        );
        return Some((
            if ok {
                MIC_SINK_LABEL.to_string()
            } else {
                cur_desc
            },
            ok,
        ));
    }
    // scrcpy stream not there yet (server handshake in progress).
    Some((String::new(), false))
}

// Live level feedback: parec taps the virtual sink's monitor and the RMS of
// each 100 ms chunk is emitted to the GUI as dB. The loop ends when parec
// exits or the owning scrcpy session leaves the process registry.
#[cfg(unix)]
async fn spawn_mic_level_meter(
    window: Window,
    device: String,
    app_handle: tauri::AppHandle,
    generation: u64,
) {
    tokio::spawn(async move {
        use tokio::io::AsyncReadExt;
        let monitor = format!("{}.monitor", MIC_SINK_NAME);
        let Some(mut child) = create_command("parec")
            .args([
                "-d",
                &monitor,
                "--format=s16le",
                "--channels=1",
                "--rate=44100",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .ok()
        else {
            let _ = window.emit(
                "scrcpy-log",
                "[MIC] Level meter unavailable (parec not found).".to_string(),
            );
            return;
        };
        let _ = window.emit(
            "scrcpy-log",
            format!("[MIC] Level meter started (parec on {}).", monitor),
        );
        let Some(mut stdout) = child.stdout.take() else {
            let _ = child.kill().await;
            let _ = window.emit(
                "scrcpy-log",
                "[MIC] Level meter ended (no stdout).".to_string(),
            );
            return;
        };
        // 88200 bytes/s -> one 100 ms chunk at s16le mono 44.1 kHz.
        let mut buf = vec![0u8; 8820];
        let mut chunks: u32 = 0;
        loop {
            if !session_alive(&app_handle, &device, generation) {
                break;
            }
            // Generous timeout: chunks arrive ~every 100 ms while the stream
            // plays; a 3s drought means parec stalled.
            let read_next = timeout(Duration::from_secs(3), stdout.read(&mut buf));
            let n = match read_next.await {
                Ok(Ok(0)) => break,
                Ok(Ok(n)) => n,
                Ok(Err(_)) | Err(_) => break,
            };
            chunks += 1;
            let samples: Vec<f64> = buf[..(n / 2) * 2]
                .as_chunks::<2>()
                .0
                .iter()
                .map(|c| {
                    let v = i16::from_le_bytes(*c) as f64 / 32768.0;
                    v * v
                })
                .collect();
            let mean_sq = if samples.is_empty() {
                0.0
            } else {
                samples.iter().sum::<f64>() / samples.len() as f64
            };
            let rms = mean_sq.sqrt();
            let db = if rms < 0.0016 {
                -60.0
            } else {
                (20.0 * rms.log10()).floor().clamp(-60.0, 0.0)
            };
            let _ = window.emit("mic-level", db);
        }
        let _ = child.kill().await;
        let _ = window.emit(
            "scrcpy-log",
            format!("[MIC] Level meter ended after {} chunks.", chunks),
        );
    });
}

fn validate_scrcpy_config(config: &ScrcpyConfig) -> Result<(), String> {
    validate::device(&config.device)?;
    validate::video_codec(config.codec.as_deref())?;
    validate::audio_codec(config.audio_codec.as_deref())?;
    validate::mic_source(config.mic_source.as_deref())?;
    validate::mic_codec(config.mic_codec.as_deref())?;
    validate::rotation(config.rotation.as_deref())?;
    validate::fps(config.fps)?;
    validate::bitrate(config.bitrate)?;
    Ok(())
}

#[tauri::command]
pub async fn run_scrcpy(
    window: Window,
    state: State<'_, ScrcpyState>,
    config: ScrcpyConfig,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    validate_scrcpy_config(&config)?;

    let video_dir = app_handle
        .path()
        .video_dir()
        .ok()
        .map(|p| p.to_string_lossy().to_string());

    let exe_path = get_binary_path("scrcpy", config.scrcpy_path.clone());

    // Log the session details for the user
    let mode_label = match config.session_mode.as_str() {
        "camera" => "Camera Mode",
        "desktop" => "Desktop Mode",
        "mic" => "Microphone Bridge",
        _ => "Screen Mirroring",
    };

    let _ = window.emit(
        "scrcpy-log",
        format!("[SYSTEM] Starting {} session...", mode_label),
    );
    if config.session_mode == "mic" {
        let _ = window.emit("scrcpy-log", format!("[SYSTEM] Target: {}", config.device));
        let _ = window.emit(
            "scrcpy-log",
            "[SYSTEM] Audio-only bridge (--no-window --no-video --audio-source=mic).".to_string(),
        );
    } else {
        let res_label = config
            .res
            .as_ref()
            .map(|r| if r == "0" { "Original" } else { r })
            .unwrap_or("Original");
        let bitrate_label = format!("{}Mbps", config.bitrate.unwrap_or(8));
        let fps_label = format!("{}fps", config.fps.unwrap_or(60));
        let _ = window.emit(
            "scrcpy-log",
            format!(
                "[SYSTEM] Target: {} | Config: {} @ {}, {}",
                config.device, res_label, bitrate_label, fps_label
            ),
        );
    }

    if config.record.unwrap_or(false) {
        let path = config
            .record_path
            .as_ref()
            .map(|p| if p.is_empty() { "Videos" } else { p })
            .unwrap_or("Videos");
        let _ = window.emit(
            "scrcpy-log",
            format!("[SYSTEM] Recording enabled -> output to {}", path),
        );
    }

    let adb_exe_path = get_binary_path("adb", config.scrcpy_path.clone());
    let server_path = if !exe_path.is_empty() && exe_path != "scrcpy" {
        Path::new(&exe_path)
            .parent()
            .map(|p| p.join("scrcpy-server").to_string_lossy().to_string())
    } else {
        None
    };

    let _ = window.emit("scrcpy-log", format!("[SYSTEM] Using scrcpy: {}", exe_path));
    let _ = window.emit(
        "scrcpy-log",
        format!("[SYSTEM] Using adb: {}", adb_exe_path),
    );

    // Mic bridge on Linux: create/refresh the virtual sink and hand the
    // scrcpy client to it through the libpulse default-sink env. Other
    // platforms get an honest console note for now.
    let pulse_sink: Option<String> = if config.session_mode == "mic" {
        #[allow(unused_mut, unused_variables)]
        let mut pulse: Option<String> = None;

        #[cfg(unix)]
        if ensure_mic_sink(&window, config.mic_denoise.unwrap_or(false)).await {
            pulse = Some(MIC_SINK_NAME.to_string());
        }

        #[cfg(not(unix))]
        {
            let _ = window.emit(
                "scrcpy-log",
                "[MIC] Virtual-microphone routing ships for Linux in this build; audio goes to the default output.".to_string(),
            );
        }
        pulse
    } else {
        None
    };

    // Bump the logical session generation BEFORE replacing the previous
    // process. Mic sidecars check this once per pass; the monitor task also
    // uses it to avoid deleting a newer session's registry entry.
    let session_generation = {
        let mut generations = state
            .session_generations
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        bump_session_generation(&mut generations, &config.device)
    };

    // One session per device: stop the previous one before spawning the new
    // child, so a fast double-start cannot leave an untracked process behind.
    let existing_to_replace = state
        .sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&config.device);
    if let Some(existing) = existing_to_replace {
        let _ = window.emit(
            "scrcpy-log",
            "[SYSTEM] Replacing the previous session for this device.".to_string(),
        );
        let notified = existing.done.notified();
        let _ = existing.stop.send(StopRequest { position: None });
        if tokio::time::timeout(Duration::from_secs(3), notified)
            .await
            .is_err()
        {
            force_kill_pid(existing.pid.load(Ordering::Relaxed));
        }
    }

    // First attempt: honour the user's audio codec choice. In "auto" mode this
    // launches without --audio-codec, matching the previous default behaviour.
    let initial_args = build_scrcpy_args(&config, video_dir.clone(), None);

    let (child, audio_error_flag) = spawn_scrcpy_streams(
        &window,
        &exe_path,
        &adb_exe_path,
        server_path.as_deref(),
        &initial_args,
        config.vsync.unwrap_or(true),
        pulse_sink.as_deref(),
    )
    .await?;

    // Decide whether automatic audio codec fallback should kick in on errors.
    let audio_enabled = config.audio_enabled.unwrap_or(true);
    let audio_codec_mode = config.audio_codec.as_deref().unwrap_or("auto").trim();
    let should_auto_fallback = audio_enabled
        && (audio_codec_mode.is_empty() || audio_codec_mode.eq_ignore_ascii_case("auto"));

    let initial_scrcpy_pid = child.id().unwrap_or(0);
    let session_pid = Arc::new(AtomicU32::new(initial_scrcpy_pid));
    let session_done = Arc::new(Notify::new());
    let (stop_tx, stop_rx) = oneshot::channel();
    state
        .sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .insert(
            config.device.clone(),
            SessionHandle {
                generation: session_generation,
                pid: session_pid.clone(),
                stop: stop_tx,
                done: session_done.clone(),
            },
        );
    let _ = window.emit(
        "scrcpy-status",
        json!({ "device": config.device, "running": true }),
    );

    // Mic bridge sidecars. Started only after the registry insert above, so
    // their contains_key liveness checks see this session on the first poll
    // (spawning them earlier raced the insert and the loops died instantly).
    if config.session_mode == "mic" {
        #[cfg(unix)]
        if pulse_sink.is_some() {
            tokio::spawn(spawn_mic_route_watcher(
                window.clone(),
                config.device.clone(),
                app_handle.clone(),
                session_generation,
            ));
            tokio::spawn(spawn_mic_level_meter(
                window.clone(),
                config.device.clone(),
                app_handle.clone(),
                session_generation,
            ));
        }
        #[cfg(not(unix))]
        drop(pulse_sink.as_deref());
    }

    // Monitor for exit (and orchestrate the audio codec fallback chain)
    let device_mon = config.device.clone();
    let window_mon = window.clone();
    let app_handle_mon = window.app_handle().clone();
    let video_dir_mon = video_dir;
    let exe_path_mon = exe_path;
    let adb_exe_path_mon = adb_exe_path;
    let server_path_mon = server_path;
    let config_mon = config.clone();
    let pulse_sink_mon = pulse_sink;

    // Position we asked scrcpy to open at this launch (if any). Used to learn
    // the decoration offset so the saved position round-trips exactly. See
    // resolve_window_pos_to_persist.
    let requested_pos: Option<(i32, i32)> = match (config_mon.window_x, config_mon.window_y) {
        (Some(x), Some(y)) => Some((x, y)),
        _ => None,
    };
    // Only track and persist the position for windowed mirror sessions. A
    // fullscreen session has no meaningful position (it would report the
    // monitor origin, e.g. 0,0), and camera/desktop sessions must not overwrite
    // the mirror window's remembered position.
    let track_pos = config_mon.session_mode == "mirror" && !config_mon.fullscreen.unwrap_or(false);

    tokio::spawn(async move {
        let mut current_child = child;
        let mut current_audio_flag = audio_error_flag;
        let mut chain_index: usize = 0;
        let mut first_window_pos: Option<(i32, i32)> = None;
        let mut last_window_pos: Option<(i32, i32)> = None;
        let mut stop_rx = stop_rx;

        loop {
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_millis(500)) => {}
                request = &mut stop_rx => {
                    let position = match request {
                        Ok(request) => request.position,
                        Err(_) => None,
                    };
                    let graceful = terminate_child(&mut current_child, Duration::from_secs(2)).await;
                    emit_window_pos_and_stop(
                        &window_mon,
                        &device_mon,
                        requested_pos,
                        first_window_pos,
                        position.or(last_window_pos),
                    );
                    let _ = window_mon.emit(
                        "scrcpy-log",
                        format!(
                            "[SYSTEM] Session stopped ({}).",
                            if graceful { "graceful" } else { "forced" }
                        ),
                    );
                    break;
                }
            }

            // Sample the live window position on every tick. This is the only
            // path that can catch a move made right before the user closes the
            // mirror window itself (rather than through stop_scrcpy, which
            // grabs its own guaranteed-fresh sample): SDL destroys the window
            // before the process exits, so by the time that exit is detected
            // below the position is unreadable, and this periodic sample is
            // all that is left to persist. Sampling every tick instead of
            // every few seconds keeps that worst case down to ~500ms stale
            // instead of several seconds.
            if track_pos {
                if let Some(pid) = current_child.id() {
                    if let Some(pos) = try_capture_window_pos(pid) {
                        if first_window_pos.is_none() {
                            first_window_pos = Some(pos);
                        }
                        last_window_pos = Some(pos);
                    }
                }
            }

            let outcome = match current_child.try_wait() {
                Ok(Some(status)) => AttemptOutcome::Exited(status.to_string()),
                Ok(None) => continue,
                Err(e) => AttemptOutcome::WaitError(e.to_string()),
            };

            match outcome {
                AttemptOutcome::WaitError(e) => {
                    let _ = window_mon.emit(
                        "scrcpy-log",
                        format!("[SYSTEM] Error waiting for scrcpy: {}", e),
                    );
                    emit_window_pos_and_stop(
                        &window_mon,
                        &device_mon,
                        requested_pos,
                        first_window_pos,
                        last_window_pos,
                    );
                    break;
                }
                AttemptOutcome::Exited(status) => {
                    let _ = window_mon.emit(
                        "scrcpy-log",
                        format!("[SYSTEM] Scrcpy process exited with status: {}", status),
                    );

                    // Give stream reader tasks a moment to flush remaining stderr
                    // lines (the audio error pattern may still be in flight).
                    tokio::time::sleep(Duration::from_millis(250)).await;

                    let audio_failed = current_audio_flag.load(Ordering::SeqCst);

                    if should_auto_fallback
                        && audio_failed
                        && chain_index < AUDIO_FALLBACK_CHAIN.len()
                    {
                        let next_codec = AUDIO_FALLBACK_CHAIN[chain_index];
                        let _ = window_mon.emit(
                            "scrcpy-log",
                            format!(
                                "[SYSTEM] Default audio codec failed, retrying with {}...",
                                next_codec.to_uppercase()
                            ),
                        );

                        let new_args =
                            build_scrcpy_args(&config_mon, video_dir_mon.clone(), Some(next_codec));

                        match spawn_scrcpy_streams(
                            &window_mon,
                            &exe_path_mon,
                            &adb_exe_path_mon,
                            server_path_mon.as_deref(),
                            &new_args,
                            config_mon.vsync.unwrap_or(true),
                            pulse_sink_mon.as_deref(),
                        )
                        .await
                        {
                            Ok((new_child, new_flag)) => {
                                session_pid.store(new_child.id().unwrap_or(0), Ordering::Relaxed);
                                current_child = new_child;
                                // New window: re-learn its decoration offset by
                                // resampling this attempt from scratch. Clear the
                                // last sample too, so we never persist the old
                                // window's position with the new (unlearned)
                                // offset if this attempt closes before its first
                                // sample.
                                first_window_pos = None;
                                last_window_pos = None;
                                current_audio_flag = new_flag;
                                chain_index += 1;
                                continue;
                            }
                            Err(e) => {
                                let _ = window_mon.emit(
                                    "scrcpy-log",
                                    format!("[SYSTEM] Failed to spawn retry: {}", e),
                                );
                                emit_window_pos_and_stop(
                                    &window_mon,
                                    &device_mon,
                                    requested_pos,
                                    first_window_pos,
                                    last_window_pos,
                                );
                                break;
                            }
                        }
                    } else if should_auto_fallback && audio_failed {
                        let _ = window_mon.emit(
                            "scrcpy-log",
                            "[SYSTEM] No compatible audio codec found. Consider disabling audio forwarding.".to_string(),
                        );
                        emit_window_pos_and_stop(
                            &window_mon,
                            &device_mon,
                            requested_pos,
                            first_window_pos,
                            last_window_pos,
                        );
                        break;
                    } else {
                        emit_window_pos_and_stop(
                            &window_mon,
                            &device_mon,
                            requested_pos,
                            first_window_pos,
                            last_window_pos,
                        );
                        break;
                    }
                }
            }
        }

        // Remove only this generation's entry: a newer session may already own
        // the key after a replacement. Unload the shared mic sink only when no
        // session remains.
        let remaining = {
            let state_lock = app_handle_mon.state::<ScrcpyState>();
            let mut sessions = state_lock
                .sessions
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if sessions.get(&device_mon).map(|s| s.generation) == Some(session_generation) {
                sessions.remove(&device_mon);
            }
            sessions.is_empty()
        };
        if config_mon.session_mode == "mic" && remaining {
            #[cfg(unix)]
            unload_mic_sink(&window_mon).await;
            #[cfg(not(unix))]
            drop(&window_mon);
        }
        session_pid.store(0, Ordering::Relaxed);
        session_done.notify_one();
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_generation_bumps_per_run_and_rejects_stale_sidecars() {
        let mut generations = HashMap::new();
        let first = bump_session_generation(&mut generations, "device1");
        assert_eq!(first, 1);
        assert!(session_generation_is_current(
            &generations,
            "device1",
            first
        ));

        // A replacement bumps the generation: the previous session's sidecars
        // are stale even though the registry key gets reused right away.
        let second = bump_session_generation(&mut generations, "device1");
        assert_eq!(second, 2);
        assert!(!session_generation_is_current(
            &generations,
            "device1",
            first
        ));
        assert!(session_generation_is_current(
            &generations,
            "device1",
            second
        ));

        // Generations are per device.
        assert_eq!(bump_session_generation(&mut generations, "device2"), 1);
        assert!(session_generation_is_current(
            &generations,
            "device1",
            second
        ));
    }

    #[test]
    fn session_generation_rejects_unknown_devices() {
        let generations = HashMap::new();
        assert!(!session_generation_is_current(&generations, "device1", 1));
    }

    #[cfg(unix)]
    async fn pid_alive(pid: u32) -> bool {
        StdCommand::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn terminate_child_escalates_when_sigterm_is_ignored() {
        // `exec` keeps the ignored SIGTERM disposition, so only the forced
        // kill can end this process. The readiness line proves the trap is
        // installed before the test signals: killing too early can beat the
        // shell's startup and make the test pass or fail by luck.
        let mut child = TokioCommand::new("sh")
            .args(["-c", "trap '' TERM; echo ready; exec sleep 30"])
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn");
        let pid = child.id().expect("pid");
        let stdout = child.stdout.take().expect("stdout");
        let mut line = String::new();
        BufReader::new(stdout)
            .read_line(&mut line)
            .await
            .expect("readiness line");
        assert_eq!(line.trim(), "ready");

        let graceful = terminate_child(&mut child, Duration::from_millis(300)).await;

        assert!(!graceful);
        assert!(!pid_alive(pid).await);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn force_kill_pid_terminates_the_process() {
        let mut child = TokioCommand::new("sleep")
            .arg("30")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn");
        let pid = child.id().expect("pid");

        force_kill_pid(pid);

        let status = child.wait().await.expect("wait");
        assert!(!status.success());
        assert!(!pid_alive(pid).await);
    }

    fn base_config(session_mode: &str) -> ScrcpyConfig {
        ScrcpyConfig {
            device: "device1".to_string(),
            session_mode: session_mode.to_string(),
            bitrate: None,
            fps: None,
            stay_awake: None,
            turn_off: None,
            audio_enabled: None,
            audio_codec: None,
            always_on_top: None,
            fullscreen: None,
            borderless: None,
            record: None,
            record_path: None,
            scrcpy_path: None,
            otg_pure: None,
            camera_facing: None,
            camera_id: None,
            codec: None,
            camera_ar: None,
            camera_high_speed: None,
            vd_width: None,
            vd_height: None,
            vd_dpi: None,
            rotation: None,
            res: None,
            hid_keyboard: None,
            hid_mouse: None,
            render_driver: None,
            flex_display: None,
            camera_torch: None,
            camera_zoom: None,
            background_color: None,
            keep_active: None,
            vsync: None,
            mic_source: None,
            mic_codec: None,
            mic_bitrate: None,
            mic_denoise: None,
            window_x: None,
            window_y: None,
            ignore_video_encoder_constraints: None,
        }
    }

    #[test]
    fn test_validate_scrcpy_config_accepts_defaults_and_rejects_bad_values() {
        assert!(validate_scrcpy_config(&base_config("mirror")).is_ok());

        let mut config = base_config("mirror");
        config.codec = Some("vp9".to_string());
        assert!(validate_scrcpy_config(&config).is_err());

        let mut config = base_config("mirror");
        config.device = "-s".to_string();
        assert!(validate_scrcpy_config(&config).is_err());

        let mut config = base_config("mic");
        config.mic_codec = Some("flac".to_string());
        assert!(validate_scrcpy_config(&config).is_err());

        let mut config = base_config("mirror");
        config.fps = Some(0);
        assert!(validate_scrcpy_config(&config).is_err());
    }

    #[test]
    fn test_build_scrcpy_args_mirror_defaults() {
        let config = base_config("mirror");
        let args = build_scrcpy_args(&config, None, None);
        assert!(args.contains(&"-s".to_string()));
        assert!(args.contains(&"device1".to_string()));
        assert!(args.contains(&"--video-codec=h264".to_string()));
    }

    #[test]
    fn test_build_scrcpy_args_camera_mode() {
        let mut config = base_config("camera");
        config.fps = Some(30);
        config.camera_facing = Some("front".to_string());

        let args = build_scrcpy_args(&config, None, None);
        assert!(args.contains(&"--video-source=camera".to_string()));
        assert!(args.contains(&"--camera-facing=front".to_string()));
        assert!(args.contains(&"--camera-fps".to_string()));
        assert!(args.contains(&"30".to_string()));
    }

    #[test]
    fn test_build_scrcpy_args_bitrate_and_fps() {
        let mut config = base_config("mirror");
        config.bitrate = Some(8);
        config.fps = Some(60);

        let args = build_scrcpy_args(&config, None, None);
        assert!(args.contains(&"--video-bit-rate".to_string()));
        assert!(args.contains(&"8M".to_string()));
        assert!(args.contains(&"--max-fps".to_string()));
        assert!(args.contains(&"60".to_string()));
    }

    #[test]
    fn test_audio_codec_auto_adds_no_flag() {
        let mut config = base_config("mirror");
        config.audio_codec = Some("auto".to_string());

        let args = build_scrcpy_args(&config, None, None);
        assert!(!args.iter().any(|a| a.starts_with("--audio-codec")));
    }

    #[test]
    fn test_audio_codec_manual_adds_flag() {
        let mut config = base_config("mirror");
        config.audio_codec = Some("aac".to_string());

        let args = build_scrcpy_args(&config, None, None);
        assert!(args.contains(&"--audio-codec=aac".to_string()));
    }

    #[test]
    fn test_audio_codec_override_takes_precedence() {
        let mut config = base_config("mirror");
        config.audio_codec = Some("auto".to_string());

        let args = build_scrcpy_args(&config, None, Some("flac"));
        assert!(args.contains(&"--audio-codec=flac".to_string()));
    }

    #[test]
    fn test_audio_codec_skipped_when_audio_disabled() {
        let mut config = base_config("mirror");
        config.audio_enabled = Some(false);
        config.audio_codec = Some("aac".to_string());

        let args = build_scrcpy_args(&config, None, None);
        assert!(args.contains(&"--no-audio".to_string()));
        assert!(!args.iter().any(|a| a.starts_with("--audio-codec")));
    }

    #[test]
    fn test_is_audio_codec_error_matches_known_patterns() {
        assert!(is_audio_codec_error(
            "ERROR: Could not create default audio encoder for opus"
        ));
        assert!(is_audio_codec_error("Failed to initialize audio/opus"));
        assert!(is_audio_codec_error("audio codec not supported on device"));
        assert!(is_audio_codec_error("audio encoder failed to start"));
    }

    #[test]
    fn test_is_audio_codec_error_ignores_unrelated() {
        assert!(!is_audio_codec_error("ADB disconnected"));
        assert!(!is_audio_codec_error("device offline"));
        assert!(!is_audio_codec_error("video encoder error"));
        assert!(!is_audio_codec_error("permission issue"));
        assert!(!is_audio_codec_error("INFO Audio codec selected: opus"));
    }

    #[test]
    fn test_build_scrcpy_args_window_position() {
        let mut config = base_config("mirror");
        config.window_x = Some(100);
        config.window_y = Some(200);
        let args = build_scrcpy_args(&config, None, None);
        assert!(args.contains(&"--window-x=100".to_string()));
        assert!(args.contains(&"--window-y=200".to_string()));
    }

    #[test]
    fn test_build_scrcpy_args_window_position_negative_coords() {
        // Multi-monitor: a display left of / above the primary yields negative
        // coordinates, which scrcpy accepts.
        let mut config = base_config("mirror");
        config.window_x = Some(-1920);
        config.window_y = Some(0);
        let args = build_scrcpy_args(&config, None, None);
        assert!(args.contains(&"--window-x=-1920".to_string()));
        assert!(args.contains(&"--window-y=0".to_string()));
    }

    #[test]
    fn test_build_scrcpy_args_window_position_skipped_in_fullscreen() {
        let mut config = base_config("mirror");
        config.window_x = Some(100);
        config.window_y = Some(200);
        config.fullscreen = Some(true);
        let args = build_scrcpy_args(&config, None, None);
        assert!(!args.iter().any(|a| a.starts_with("--window-x")));
        assert!(!args.iter().any(|a| a.starts_with("--window-y")));
    }

    #[test]
    fn test_build_scrcpy_args_window_position_only_mirror() {
        // Camera (and desktop) sessions must not receive the mirror window's
        // remembered position, it is scoped to mirror mode.
        let mut config = base_config("camera");
        config.window_x = Some(100);
        config.window_y = Some(200);
        let args = build_scrcpy_args(&config, None, None);
        assert!(!args.iter().any(|a| a.starts_with("--window-x")));
        assert!(!args.iter().any(|a| a.starts_with("--window-y")));
    }

    #[test]
    fn test_parse_shell_var_int() {
        let text = "WINDOW=12345\nX=959\nY=24\nWIDTH=428\nHEIGHT=928\n";
        assert_eq!(parse_shell_var_int(text, "X"), Some(959));
        assert_eq!(parse_shell_var_int(text, "Y"), Some(24));
        assert_eq!(parse_shell_var_int(text, "MISSING"), None);
    }

    #[test]
    fn test_resolve_window_pos_first_launch_uses_raw() {
        // First launch ever (nothing requested): persist the raw last sample.
        assert_eq!(
            resolve_window_pos_to_persist(None, Some((100, 72)), (300, 222)),
            (300, 222)
        );
        assert_eq!(
            resolve_window_pos_to_persist(None, None, (300, 222)),
            (300, 222)
        );
    }

    #[test]
    fn test_resolve_window_pos_zero_offset_is_noop() {
        // Windows/Linux: the tool already reports the client origin, so the
        // first sample matches what we requested -> offset 0 -> last unchanged.
        let requested = Some((100, 100));
        let first = Some((100, 100));
        assert_eq!(
            resolve_window_pos_to_persist(requested, first, (640, 480)),
            (640, 480)
        );
    }

    #[test]
    fn test_resolve_window_pos_cancels_titlebar_offset() {
        // macOS-like: the tool reports the frame origin (title-bar top), 28 px
        // above the client origin scrcpy positions. Requested (100,100) but
        // first observed (100,72); the -28 px offset must be cancelled so the
        // persisted value maps back to the client origin.
        let requested = Some((100, 100));
        let first = Some((100, 72));
        assert_eq!(
            resolve_window_pos_to_persist(requested, first, (300, 222)),
            (300, 250)
        );
    }

    #[test]
    fn test_resolve_window_pos_cancels_full_frame_offset() {
        // Frame offset on both axes (border + title bar).
        let requested = Some((100, 100));
        let first = Some((92, 69));
        assert_eq!(
            resolve_window_pos_to_persist(requested, first, (292, 219)),
            (300, 250)
        );
    }

    #[test]
    fn test_resolve_window_pos_ignores_implausible_offset() {
        // The window was moved before the first sample (or placed by the WM):
        // the offset dwarfs any window decoration, so fall back to the raw last.
        let requested = Some((100, 100));
        let first = Some((900, 700));
        assert_eq!(
            resolve_window_pos_to_persist(requested, first, (950, 760)),
            (950, 760)
        );
    }

    #[test]
    fn test_cap_terminal_output_keeps_small_output() {
        assert_eq!(cap_terminal_output("ok".to_string()), "ok");
    }

    #[test]
    fn test_cap_terminal_output_truncates_on_char_boundary() {
        // Two-byte chars: a naive byte cut would slice one in half and panic
        // on the next String operation.
        let text = "é".repeat(MAX_TERMINAL_OUTPUT_BYTES / 2 + 1);
        let capped = cap_terminal_output(text);
        assert!(capped.ends_with("[output truncated]"));
        assert!(capped.len() <= MAX_TERMINAL_OUTPUT_BYTES + "\n[output truncated]".len());
    }

    #[test]
    fn test_parse_adb_device_line_usb_serial() {
        assert_eq!(
            parse_adb_device_line("ZY22MGW35T device"),
            Some(("ZY22MGW35T".to_string(), "device".to_string()))
        );
    }

    #[test]
    fn test_parse_adb_device_line_tcpip_serial() {
        assert_eq!(
            parse_adb_device_line("192.168.1.50:5555 device"),
            Some(("192.168.1.50:5555".to_string(), "device".to_string()))
        );
    }

    #[test]
    fn test_parse_adb_device_line_mdns_serial() {
        assert_eq!(
            parse_adb_device_line("adb-ZY22MGW35T-Z3uXXq._adb-tls-connect._tcp device"),
            Some((
                "adb-ZY22MGW35T-Z3uXXq._adb-tls-connect._tcp".to_string(),
                "device".to_string()
            ))
        );
    }

    #[test]
    fn test_parse_adb_device_line_mdns_conflict_serial_with_space() {
        // mDNS conflict resolution appends " (2)" inside the serial itself, so
        // the line has a space that is NOT the serial/state separator.
        assert_eq!(
            parse_adb_device_line("adb-ZY22MGW35T-Z3uXXq (2)._adb-tls-connect._tcp device"),
            Some((
                "adb-ZY22MGW35T-Z3uXXq (2)._adb-tls-connect._tcp".to_string(),
                "device".to_string()
            ))
        );
    }

    #[test]
    fn test_parse_adb_device_line_ignores_trailing_l_fields() {
        // `adb devices -l` appends product/model/transport_id fields after the
        // state; they must not affect the parsed serial or state.
        assert_eq!(
            parse_adb_device_line(
                "ZY22MGW35T device usb:1-1 product:foo model:bar device:baz transport_id:1"
            ),
            Some(("ZY22MGW35T".to_string(), "device".to_string()))
        );
    }

    #[test]
    fn test_extract_device_model_replaces_underscores_with_spaces() {
        assert_eq!(
            extract_device_model(
                "ZY22MGW35T device usb:1-1 product:foo model:SM_S911B device:baz transport_id:1"
            ),
            Some("SM S911B".to_string())
        );
    }

    #[test]
    fn test_extract_device_model_missing_field_returns_none() {
        assert_eq!(extract_device_model("ZY22MGW35T device"), None);
    }

    #[test]
    fn test_parse_adb_device_line_offline_and_unauthorized() {
        assert_eq!(
            parse_adb_device_line("ZY22MGW35T offline"),
            Some(("ZY22MGW35T".to_string(), "offline".to_string()))
        );
        assert_eq!(
            parse_adb_device_line("192.168.1.50:5555 unauthorized"),
            Some(("192.168.1.50:5555".to_string(), "unauthorized".to_string()))
        );
    }

    #[test]
    fn test_parse_adb_device_line_unparsable_returns_none() {
        assert_eq!(parse_adb_device_line(""), None);
        assert_eq!(parse_adb_device_line("List of devices attached"), None);
    }

    #[test]
    fn test_get_devices_filtering_keeps_only_device_state() {
        // Mirrors the filter chain in get_devices: only the exact "device"
        // state is kept, regardless of serial shape, including mDNS wireless
        // debugging serials (._tcp/._udp) that must no longer be excluded.
        let output = "List of devices attached\n\
             ZY22MGW35T device usb:1-1 product:foo model:bar transport_id:1\n\
             192.168.1.50:5555 device product:foo model:bar transport_id:2\n\
             adb-ZY22MGW35T-Z3uXXq._adb-tls-connect._tcp device product:foo transport_id:3\n\
             adb-ZY22MGW35T-Z3uXXq (2)._adb-tls-connect._tcp device product:foo transport_id:4\n\
             emulator-5554 offline\n\
             0123456789ABCDEF unauthorized\n";

        let devices: Vec<String> = output
            .lines()
            .skip(1)
            .filter_map(parse_adb_device_line)
            .filter(|(_, state)| state == "device")
            .map(|(serial, _)| serial)
            .collect();

        assert_eq!(
            devices,
            vec![
                "ZY22MGW35T".to_string(),
                "192.168.1.50:5555".to_string(),
                "adb-ZY22MGW35T-Z3uXXq._adb-tls-connect._tcp".to_string(),
                "adb-ZY22MGW35T-Z3uXXq (2)._adb-tls-connect._tcp".to_string(),
            ]
        );
    }

    #[test]
    fn test_is_expected_asset_name_accepts_real_releases() {
        assert!(is_expected_asset_name("scrcpy-win64-v3.3.3.zip", ".zip"));
        assert!(is_expected_asset_name(
            "scrcpy-linux-x86_64-v2.7.tar.gz",
            ".tar.gz"
        ));
    }

    #[test]
    fn test_is_expected_asset_name_rejects_unexpected() {
        assert!(!is_expected_asset_name("scrcpy-win64-v3.3.3.exe", ".zip"));
        assert!(!is_expected_asset_name("../evil.zip", ".zip"));
        assert!(!is_expected_asset_name("/abs/scrcpy-win64-v1.zip", ".zip"));
        assert!(!is_expected_asset_name("scrcpy-win64-v1.zip ", ".zip"));
        assert!(!is_expected_asset_name("scrcpy-v1/../../evil.zip", ".zip"));
        let oversized = format!("scrcpy-{}.zip", "a".repeat(200));
        assert!(!is_expected_asset_name(&oversized, ".zip"));
    }

    #[test]
    fn test_find_wlan_ipv4_keeps_scanning_past_trailing_src() {
        assert_eq!(
            find_wlan_ipv4("inet 10.0.0.5/24 brd 10.0.0.255 scope global wlan0 src"),
            Some("10.0.0.5".to_string())
        );
    }

    #[test]
    fn test_find_wlan_ipv4_ignores_ipv6_and_junk() {
        assert_eq!(find_wlan_ipv4("inet fe80::1/64 src ::1"), None);
        assert_eq!(find_wlan_ipv4(""), None);
        assert_eq!(find_wlan_ipv4("src"), None);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn test_get_local_scrcpy_version_times_out_on_hung_binary() {
        use std::os::unix::fs::PermissionsExt;

        let dir = std::env::temp_dir().join(format!("openscrcpy-version-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let fake = dir.join("scrcpy");
        std::fs::write(&fake, "#!/bin/sh\nsleep 30\n").expect("fake scrcpy");
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).expect("chmod");

        let started = std::time::Instant::now();
        let version = get_local_scrcpy_version(Some(dir.to_string_lossy().to_string())).await;
        let _ = std::fs::remove_dir_all(&dir);

        assert!(version.is_none());
        assert!(started.elapsed() < std::time::Duration::from_secs(10));
    }

    #[test]
    fn test_safe_file_name_keeps_final_component() {
        assert_eq!(
            safe_file_name("report.json"),
            Some("report.json".to_string())
        );
        assert_eq!(
            safe_file_name("../../etc/passwd"),
            Some("passwd".to_string())
        );
        assert_eq!(
            safe_file_name("/tmp/report.json"),
            Some("report.json".to_string())
        );
        assert_eq!(safe_file_name(""), None);
    }

    #[test]
    fn test_sanitize_filename_component_allowlists() {
        assert_eq!(
            sanitize_filename_component("192.168.1.50:5555"),
            "192.168.1.50_5555"
        );
        assert_eq!(
            sanitize_filename_component("emulator-5554"),
            "emulator-5554"
        );
        assert_eq!(sanitize_filename_component("../../evil"), "_.._evil");
        assert_eq!(sanitize_filename_component("..."), "device");
        assert_eq!(sanitize_filename_component(""), "device");
    }
}

#[tauri::command]
pub async fn stop_scrcpy(state: State<'_, ScrcpyState>, device: String) -> Result<(), String> {
    let handle = {
        let mut sessions = state.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions.remove(&device)
    };
    let Some(handle) = handle else {
        return Ok(());
    };

    let SessionHandle {
        pid, stop, done, ..
    } = handle;
    let pid_value = pid.load(Ordering::Relaxed);

    // Grab the window's position now, one last time, before it is killed:
    // this is the only moment it is guaranteed to still be exactly where the
    // user left it. The monitor task refreshes its own sample every ~500ms,
    // but a move right before Stop could still beat it.
    let position = if pid_value != 0 {
        try_capture_window_pos(pid_value)
    } else {
        None
    };

    let notified = done.notified();
    let _ = stop.send(StopRequest { position });

    match tokio::time::timeout(Duration::from_secs(3), notified).await {
        Ok(_) => Ok(()),
        Err(_) => {
            force_kill_pid(pid_value);
            Err("session did not stop within 3s".to_string())
        }
    }
}

// App exit teardown: kill every registered child (mirror, camera, mic
// bridge) and unload the mic sink, so closing the app cannot leave audio
// or a mirror running in the background. This handler is synchronous, so it
// uses SIGKILL/TerminateProcess instead of waiting for a graceful stop.
pub fn teardown_sessions(app_handle: &tauri::AppHandle) {
    let state = app_handle.state::<ScrcpyState>();
    let handles: Vec<SessionHandle> = {
        let mut sessions = state.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions.drain().map(|(_, handle)| handle).collect()
    };
    for handle in handles {
        let pid = handle.pid.load(Ordering::Relaxed);
        let _ = handle.stop.send(StopRequest { position: None });
        force_kill_pid(pid);
    }
    #[cfg(unix)]
    teardown_mic_sink();
}

// Synchronous sink teardown for process exit: event handlers run outside
// the async runtime, so this cannot reuse the window-based helper.
#[cfg(unix)]
fn teardown_mic_sink() {
    let Ok(modules) = StdCommand::new("pactl")
        .args(["list", "short", "modules"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
    else {
        return;
    };
    let module_idx = modules
        .lines()
        .find(|l| l.contains(&format!("sink_name={}", MIC_SINK_NAME)))
        .and_then(|l| l.split('\t').next().map(str::to_string));
    if let Some(idx) = module_idx {
        let _ = StdCommand::new("pactl")
            .args(["unload-module", &idx])
            .output();
    }
}

#[tauri::command]
pub async fn download_scrcpy(window: Window, app_handle: tauri::AppHandle) -> Result<(), String> {
    use std::io::Write;

    let (arch_tag, extension) =
        download::resolve_asset(std::env::consts::OS, std::env::consts::ARCH)?;

    let _ = window.emit(
        "scrcpy-log",
        format!(
            "[SYSTEM] Detecting platform: {} ({})",
            std::env::consts::OS,
            arch_tag
        ),
    );
    let _ = window.emit("scrcpy-status", json!({ "type": "downloading", "success": true, "message": format!("Fetching latest {} release...", arch_tag) }));

    let client = http_client("OpenScrcpy-Downloader")?;

    // Attempt to get the latest release via API, but fallback to redirect scraping if rate limited
    let mut download_url = String::new();
    let mut filename = String::new();
    let mut release_tag: Option<String> = None;

    let api_url = "https://api.github.com/repos/Genymobile/scrcpy/releases/latest";
    let api_resp = client
        .get(api_url)
        .timeout(Duration::from_secs(15))
        .send()
        .await;

    let mut used_fallback = false;

    if let Ok(resp) = api_resp {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                release_tag = json["tag_name"].as_str().map(str::to_string);
                if let Some(assets) = json["assets"].as_array() {
                    for asset in assets {
                        let name = asset["name"].as_str().unwrap_or("");
                        if name.contains(arch_tag) && name.ends_with(extension) {
                            download_url = asset["browser_download_url"]
                                .as_str()
                                .unwrap_or("")
                                .to_string();
                            filename = name.to_string();
                            break;
                        }
                    }
                }
            }
        } else if resp.status() == reqwest::StatusCode::FORBIDDEN {
            let _ = window.emit(
                "scrcpy-log",
                "[SYSTEM] API rate limited, attempting fallback discovery...",
            );
            used_fallback = true;
        }
    } else {
        used_fallback = true;
    }

    if used_fallback || download_url.is_empty() {
        // Fallback: Follow redirect of /releases/latest to get the tag name
        let redirect_res = client
            .get("https://github.com/Genymobile/scrcpy/releases/latest")
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| format!("Fallback failed: {}", e))?;

        let final_url = redirect_res.url().as_str();
        // URL is like https://github.com/Genymobile/scrcpy/releases/tag/v2.7
        if let Some(tag) = final_url.split('/').next_back() {
            if tag.starts_with('v') {
                filename = format!("scrcpy-{}-{}{}", arch_tag, tag, extension);
                download_url = format!(
                    "https://github.com/Genymobile/scrcpy/releases/download/{}/{}",
                    tag, filename
                );
                release_tag = Some(tag.to_string());
                let _ = window.emit(
                    "scrcpy-log",
                    format!("[SYSTEM] Discovered latest tag via fallback: {}", tag),
                );
            }
        }
    }

    if download_url.is_empty() {
        return Err(format!(
            "Could not find {} binary. (API rate limit might be active)",
            arch_tag
        ));
    }

    // Only accept asset names matching the expected scrcpy release pattern.
    // The fallback path builds this name itself, but the API path echoes a
    // server-provided string, so validate it before downloading.
    if !is_expected_asset_name(&filename, extension) {
        return Err("Unexpected release asset name, aborting download".to_string());
    }

    let _ = window.emit("scrcpy-log", format!("[SYSTEM] Found asset: {}", filename));

    let release_tag = release_tag
        .ok_or_else(|| format!("Could not determine the release tag for {}", filename))?;

    // Checksums are published next to the archive; verify before extraction.
    let sums_url = format!(
        "https://github.com/Genymobile/scrcpy/releases/download/{}/SHA256SUMS.txt",
        release_tag
    );
    let sums_resp = client
        .get(&sums_url)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch SHA256SUMS.txt: {}", e))?;
    if !sums_resp.status().is_success() {
        return Err(format!(
            "Release {} does not publish SHA256SUMS.txt; aborting download",
            release_tag
        ));
    }
    let sums_text = sums_resp
        .text()
        .await
        .map_err(|e| format!("Failed to read SHA256SUMS.txt: {}", e))?;
    let expected_hash = download::parse_sha256sums(&sums_text, &filename)?;

    let install_path = match download::install_dir() {
        Some(dir) => dir.to_path_buf(),
        None => download::init_install_dir(&app_handle),
    };
    let install_parent = install_path
        .parent()
        .ok_or_else(|| "Invalid install directory".to_string())?
        .to_path_buf();
    std::fs::create_dir_all(&install_parent)
        .map_err(|e| format!("Failed to create install directory: {}", e))?;

    let pid = std::process::id();
    let temp_archive_path = install_parent.join(format!("scrcpy-bin.tmp-{}{}", pid, extension));
    let temp_extract_dir = install_parent.join(format!("scrcpy-bin.extract-{}", pid));
    let new_dir = install_path.with_file_name("scrcpy-bin.new");
    let old_dir = install_path.with_file_name("scrcpy-bin.old");
    let mut cleanup = download::TempCleanup::new(vec![
        temp_archive_path.clone(),
        temp_extract_dir.clone(),
        new_dir.clone(),
    ]);

    {
        let mut file = std::fs::File::create(&temp_archive_path)
            .map_err(|e| format!("Failed to create archive file: {}", e))?;
        let mut download_resp = timeout(Duration::from_secs(30), client.get(&download_url).send())
            .await
            .map_err(|_| "Timed out connecting to the download URL".to_string())?
            .map_err(|e| format!("Failed to connect to download URL: {}", e))?;
        if !download_resp.status().is_success() {
            return Err(format!(
                "Download failed with HTTP {}",
                download_resp.status()
            ));
        }
        let total_size = download_resp.content_length().unwrap_or(0);

        let _ = window.emit(
            "scrcpy-log",
            format!("[SYSTEM] Downloading: {} MB", total_size / 1024 / 1024),
        );

        let mut downloaded: u64 = 0;
        let mut last_percent: Option<u64> = None;
        loop {
            // A stalled transfer must not keep the download flag on forever.
            // The timeout is per chunk, not for the whole file, so a slow but
            // healthy link still gets to finish.
            let chunk = timeout(Duration::from_secs(30), download_resp.chunk())
                .await
                .map_err(|_| "Download stalled for 30s".to_string())?
                .map_err(|e| e.to_string())?;
            let Some(chunk) = chunk else { break };
            file.write_all(&chunk)
                .map_err(|e| format!("Failed to write chunk: {}", e))?;
            downloaded += chunk.len() as u64;
            if let Some(percent) = (downloaded * 100).checked_div(total_size) {
                // Chunks are a few KB: emitting on every one floods the
                // webview with hundreds of identical percentages.
                if last_percent != Some(percent) {
                    last_percent = Some(percent);
                    let _ = window.emit(
                        "scrcpy-status",
                        json!({ "type": "download-progress", "percent": percent }),
                    );
                }
            }
        }
    }

    let actual_hash = download::sha256_file(&temp_archive_path)?;
    if actual_hash != expected_hash {
        return Err(format!(
            "Checksum mismatch for {}: expected {}, got {}",
            filename, expected_hash, actual_hash
        ));
    }

    let _ = window.emit(
        "scrcpy-log",
        "[SYSTEM] Download finished. Starting extraction...",
    );
    let _ = window.emit(
        "scrcpy-status",
        json!({ "type": "downloading", "success": true, "message": "Extracting binaries..." }),
    );

    let _ = window.emit(
        "scrcpy-log",
        format!(
            "[SYSTEM] Decompressing {} archive...",
            if extension == ".zip" { "ZIP" } else { "TAR.GZ" }
        ),
    );
    download::extract_archive(&temp_archive_path, &temp_extract_dir, extension)?;

    let source_root = download::single_root(&temp_extract_dir)?;
    let needs_adb = source_root.join(download::exe_name("adb")).is_file();

    if std::fs::rename(&source_root, &new_dir).is_err() {
        download::copy_dir_all(&source_root, &new_dir)
            .map_err(|e| format!("Failed to stage extracted files: {}", e))?;
    }
    download::validate_extracted(&new_dir, needs_adb)?;

    // A live session keeps the old binaries mapped, and on Windows can lock
    // the install directory so the next update fails to clear its backup.
    // Refuse instead of swapping underneath a running mirror.
    let sessions_active = !app_handle
        .state::<ScrcpyState>()
        .sessions
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .is_empty();
    if sessions_active {
        return Err("Stop all mirror sessions before updating the scrcpy core".to_string());
    }

    // The adb server outlives the download and may still be running the old
    // binary. Kill it so the next adb call starts from the new tree.
    let mut adb_stop = create_command(get_binary_path("adb", None));
    adb_stop.arg("kill-server");
    if let Err(e) = process::output_with_timeout(adb_stop, Duration::from_secs(5)).await {
        let _ = window.emit(
            "scrcpy-log",
            format!("[SYSTEM] Could not stop adb before installing: {}", e),
        );
    }

    // Swap the staged tree into place, restoring the previous install if the
    // final rename fails.
    if old_dir.exists() {
        std::fs::remove_dir_all(&old_dir)
            .map_err(|e| format!("Failed to clear previous backup: {}", e))?;
    }
    let backup = if install_path.exists() {
        std::fs::rename(&install_path, &old_dir)
            .map_err(|e| format!("Failed to move previous install aside: {}", e))?;
        true
    } else {
        false
    };
    if let Err(e) = std::fs::rename(&new_dir, &install_path) {
        if backup {
            let _ = std::fs::rename(&old_dir, &install_path);
        }
        return Err(format!("Failed to install scrcpy binaries: {}", e));
    }
    if backup {
        let _ = std::fs::remove_dir_all(&old_dir);
    }

    let _ = std::fs::remove_file(&temp_archive_path);
    let _ = std::fs::remove_dir_all(&temp_extract_dir);
    cleanup.disarm();

    let _ = window.emit("scrcpy-status", json!({ "type": "download-complete", "success": true, "message": install_path.to_string_lossy() }));
    Ok(())
}

#[tauri::command]
pub async fn get_videos_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    app_handle
        .path()
        .video_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_report(
    app_handle: tauri::AppHandle,
    content: String,
    name: String,
) -> Result<String, String> {
    use std::fs;
    use tauri::Manager;

    let downloads = app_handle
        .path()
        .download_dir()
        .map_err(|e| e.to_string())?;

    // Keep only the final path component so a crafted `name` cannot escape
    // the downloads directory (absolute paths or `..` segments).
    let safe_name = safe_file_name(&name).ok_or_else(|| "Invalid report name".to_string())?;
    let path = downloads.join(&safe_name);
    fs::write(&path, content).map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_scrcpy_bin_dir() -> Result<String, String> {
    if let Some(dir) = download::install_dir() {
        if dir.exists() {
            return Ok(dir.to_string_lossy().to_string());
        }
    }

    let current_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .or_else(|| std::env::current_dir().ok())
        .ok_or_else(|| "Could not determine application directory".to_string())?;

    let extract_path = current_dir.join("scrcpy-bin");

    if extract_path.exists() {
        Ok(extract_path.to_string_lossy().to_string())
    } else {
        Ok(current_dir.to_string_lossy().to_string())
    }
}

pub async fn get_local_scrcpy_version(custom_path: Option<String>) -> Option<String> {
    let exe_path = get_binary_path("scrcpy", custom_path);
    let mut cmd = create_command(&exe_path);
    cmd.arg("--version");
    let output = process::output_with_timeout(cmd, Duration::from_secs(3))
        .await
        .ok()?;
    if output.status.success() {
        let out_str = String::from_utf8_lossy(&output.stdout);
        for line in out_str.lines() {
            if line.contains("scrcpy") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(idx) = parts.iter().position(|&x| x == "scrcpy") {
                    if let Some(version) = parts.get(idx + 1) {
                        return Some(version.trim_start_matches('v').to_string());
                    }
                }
            }
        }
    }
    None
}

pub async fn get_latest_scrcpy_version() -> Result<String, String> {
    let client = http_client("OpenScrcpy-Updater")?;

    let api_url = "https://api.github.com/repos/Genymobile/scrcpy/releases/latest";
    let api_resp = client
        .get(api_url)
        .timeout(Duration::from_secs(15))
        .send()
        .await;

    let mut tag_name = String::new();
    let mut used_fallback = false;

    if let Ok(resp) = api_resp {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(tag) = json["tag_name"].as_str() {
                    tag_name = tag.trim_start_matches('v').to_string();
                }
            }
        } else if resp.status() == reqwest::StatusCode::FORBIDDEN {
            used_fallback = true;
        }
    } else {
        used_fallback = true;
    }

    if used_fallback || tag_name.is_empty() {
        let redirect_res = client
            .get("https://github.com/Genymobile/scrcpy/releases/latest")
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| format!("Fallback failed: {}", e))?;

        let final_url = redirect_res.url().as_str();
        if let Some(tag) = final_url.split('/').next_back() {
            if tag.starts_with('v') || tag.chars().next().is_some_and(|c| c.is_ascii_digit()) {
                tag_name = tag.trim_start_matches('v').to_string();
            }
        }
    }

    if tag_name.is_empty() {
        return Err("Could not determine latest version".to_string());
    }

    Ok(tag_name)
}

fn compare_versions(local: &str, remote: &str) -> bool {
    let local_parts: Vec<u32> = local
        .split('.')
        .filter_map(|s| {
            s.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse()
                .ok()
        })
        .collect();
    let remote_parts: Vec<u32> = remote
        .split('.')
        .filter_map(|s| {
            s.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
                .parse()
                .ok()
        })
        .collect();

    for i in 0..std::cmp::max(local_parts.len(), remote_parts.len()) {
        let local_val = local_parts.get(i).cloned().unwrap_or(0);
        let remote_val = remote_parts.get(i).cloned().unwrap_or(0);
        if remote_val > local_val {
            return true;
        } else if local_val > remote_val {
            return false;
        }
    }
    false
}

#[tauri::command]
pub async fn check_scrcpy_update(custom_path: Option<String>) -> serde_json::Value {
    let local_version = match get_local_scrcpy_version(custom_path.clone()).await {
        Some(v) => v,
        None => {
            return json!({ "update_available": false, "local_version": null, "latest_version": null, "message": "Scrcpy not installed or not working" })
        }
    };

    let latest_version = match get_latest_scrcpy_version().await {
        Ok(v) => v,
        Err(e) => {
            return json!({ "update_available": false, "local_version": local_version, "latest_version": null, "message": format!("Could not fetch latest release: {}", e) })
        }
    };

    let update_available = compare_versions(&local_version, &latest_version);

    json!({
        "update_available": update_available,
        "local_version": local_version,
        "latest_version": latest_version
    })
}

// "Ver no Forgejo" from the update modal: open the releases page in the
// user's browser. Rust-side open keeps it outside the webview popup rules;
// the HTTPS check keeps the shell handler from being abused with anything
// else even if a future caller passes this command a value.
#[tauri::command]
pub async fn open_app_release(app: tauri::AppHandle) -> Result<(), String> {
    tauri_plugin_opener::OpenerExt::opener(&app)
        .open_url(
            "https://v16.next.forgejo.org/UmbrCorp/OpenScrcpy/releases/latest",
            None::<&str>,
        )
        .map_err(|e| e.to_string())
}

// One-click USB -> wireless switch: read the phone's Wi-Fi IP from its own
// routing table, lift adbd into TCPIP mode, then point the daemon back at
// the phone over the network. Every step is logged to the console like
// the rest of the adb surface, so a failure is diagnosable in-app.
#[tauri::command]
pub async fn goto_wireless(
    window: Window,
    device: String,
    custom_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let adb_path = get_binary_path("adb", custom_path);
    let _ = window.emit(
        "scrcpy-log",
        "[SYSTEM] Switching to wireless...".to_string(),
    );

    // 1) The phone's Wi-Fi IPv4. `addr show wlan0` reads the Wi-Fi interface
    //    directly, so a VPN tunnel on the phone cannot steal the answer the
    //    way it does with the default-route source address; `ip route get`
    //    stays as fallback (a few OEMs rename the interface).
    let mut ip = String::new();
    for probe in ["ip -f inet addr show wlan0", "ip route get 1.1.1.1"] {
        let mut cmd = create_command(&adb_path);
        cmd.args(["-s", &device, "shell", probe]);
        let output = process::output_with_timeout(cmd, Duration::from_secs(5)).await?;
        if let Some(found) = find_wlan_ipv4(&String::from_utf8_lossy(&output.stdout)) {
            ip = found;
            break;
        }
    }
    if ip.is_empty() {
        let _ = window.emit(
            "scrcpy-log",
            "[SYSTEM] Could not read the Wi-Fi IP — is the phone actually on a Wi-Fi network?"
                .to_string(),
        );
        return Ok(json!({ "success": false, "message": "could not read the device Wi-Fi IPv4" }));
    }

    let _ = window.emit(
        "scrcpy-log",
        format!("[SYSTEM] adbd restarting in TCP mode (Wi-Fi IP {}).", ip),
    );
    let mut cmd = create_command(&adb_path);
    cmd.args(["-s", &device, "tcpip", "5555"]);
    let output = process::output_with_timeout(cmd, Duration::from_secs(5)).await?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let _ = window.emit("scrcpy-log", format!("[ADB ERROR] {}", err));
        return Ok(json!({
            "success": false,
            "message": if err.is_empty() { "adb tcpip failed".to_string() } else { err }
        }));
    }

    // 2) adbd needs a beat to come back up before the connect can land.
    tokio::time::sleep(Duration::from_millis(1500)).await;

    let target = format!("{}:5555", ip);
    let mut cmd = create_command(&adb_path);
    cmd.args(["connect", &target]);
    let output = process::output_with_timeout(cmd, Duration::from_secs(7)).await?;
    let out_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !out_text.is_empty() {
        let _ = window.emit("scrcpy-log", format!("[ADB] {}", out_text));
    }
    let success = output.status.success()
        && !out_text.contains("cannot connect")
        && !out_text.contains("failed");
    if success {
        let _ = window.emit(
            "scrcpy-log",
            format!(
                "[OK] Wireless ready at {} — you can unplug the cable.",
                target
            ),
        );
    }
    Ok(json!({ "success": success, "ip": ip, "port": 5555, "message": out_text }))
}

// Pull the first dotted-quad after "src"/"inet" out of `ip` output.
// Skips IPv6 candidates ("inet6 fe80::.../64" yields nothing valid), so the
// caller always gets a wlan v4 address or None.
fn find_wlan_ipv4(text: &str) -> Option<String> {
    let tokens: Vec<&str> = text.split_whitespace().collect();
    for (i, tok) in tokens.iter().enumerate() {
        if *tok != "src" && *tok != "inet" {
            continue;
        }
        let Some(raw) = tokens.get(i + 1) else {
            continue;
        };
        let candidate = raw.split('/').next().unwrap_or("");
        let segs: Vec<&str> = candidate.split('.').collect();
        let is_v4 = segs.len() == 4
            && segs
                .iter()
                .all(|s| !s.is_empty() && s.len() <= 3 && s.chars().all(|c| c.is_ascii_digit()));
        if is_v4 {
            return Some(candidate.to_string());
        }
    }
    None
}
