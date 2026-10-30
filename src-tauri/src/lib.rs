mod commands;
mod download;
mod process;
mod validate;
// Windows-only: drag the borderless scrcpy window with the mouse
// (Ctrl+Alt+Shift+W).
#[cfg(target_os = "windows")]
mod grab;
// Cross-platform global OS shortcuts (e.g. Ctrl+Alt+Shift+C to recentre the
// active mirror window), shared with grab.rs's Windows-only drag toggle.
mod shortcuts;
use std::collections::HashMap;
use std::sync::atomic::AtomicU32;
use std::sync::{Arc, Mutex};
use tauri::Manager;
use tokio::sync::{oneshot, Notify};

#[cfg(target_os = "linux")]
use std::os::unix::process::CommandExt;

/// One running session. The monitor task owns the `Child`; the registry keeps
/// only what other commands need: the PID to target, a channel to ask the
/// task to stop, and a notification that it finished.
pub struct SessionHandle {
    pub generation: u64,
    pub pid: Arc<AtomicU32>,
    pub stop: oneshot::Sender<StopRequest>,
    pub done: Arc<Notify>,
}

#[derive(Debug)]
pub struct StopRequest {
    /// Position captured by `stop_scrcpy` while the window still exists.
    pub position: Option<(i32, i32)>,
}

pub struct ScrcpyState {
    pub sessions: Mutex<HashMap<String, SessionHandle>>,
    /// Logical session generation per device serial, bumped by every
    /// run_scrcpy. Mic sidecar loops (route watcher, level meter) capture the
    /// value at spawn and exit once it moves past theirs: a replaced session
    /// reuses the same registry key, so the plain `contains_key` check alone
    /// cannot tell the previous session's loops apart from the new one.
    pub session_generations: Mutex<HashMap<String, u64>>,
    pub active_device: Mutex<Option<String>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Fix for white screen on Linux (Wayland/NVIDIA)
    #[cfg(target_os = "linux")]
    {
        if std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").is_err() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }

        // Workaround for AppImage blank UI on Fedora/Wayland
        // Preload the host's libwayland-client.so.0 to prevent conflicts with bundled version
        // Checking whether it is an AppImage or not by checking APPDIR environment variable
        if std::env::var("APPDIR").is_ok() && std::env::var("WAYLAND_DISPLAY").is_ok() {
            let preload = std::env::var("LD_PRELOAD").unwrap_or_default();
            if !preload.contains("libwayland-client.so.0") {
                // checking host native libwayland-client.so.0 is loaded or not by checking LD_PRELOAD environment variable
                let paths = [
                    "/usr/lib64/libwayland-client.so.0",
                    "/usr/lib/x86_64-linux-gnu/libwayland-client.so.0",
                    "/usr/lib/libwayland-client.so.0",
                ];
                for path in paths {
                    // if host native libwayland-client.so.0 is found it will be loaded instead of bundled version
                    if std::path::Path::new(path).exists() {
                        let mut new_preload = preload;
                        if !new_preload.is_empty() {
                            new_preload.push(':');
                        }
                        new_preload.push_str(path);
                        std::env::set_var("LD_PRELOAD", &new_preload);

                        let current_exe = std::env::current_exe()
                            .ok()
                            .or_else(|| std::env::args_os().next().map(std::path::PathBuf::from));
                        let Some(current_exe) = current_exe else {
                            eprintln!(
                                "[SYSTEM] Could not resolve argv[0]; skipping Wayland re-exec."
                            );
                            break;
                        };
                        let mut cmd = std::process::Command::new(current_exe);
                        cmd.args(std::env::args_os().skip(1));
                        let _ = cmd.exec();
                        break;
                    }
                }
            }
        }
    }

    let builder = tauri::Builder::default()
        // Must be the first plugin: a second launch exits here, after asking
        // the running instance to surface its window.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // The global-shortcut plugin must be registered on the builder (its
        // setup wires the OS hotkey manager on the main thread). Individual
        // shortcuts are registered below in setup.
        .plugin(shortcuts::plugin());

    let app = builder
        .setup(|app| {
            // Resolve once: portable installs keep scrcpy next to the exe;
            // read-only locations (/usr/bin, Program Files) use app data.
            download::init_install_dir(app.handle());

            app.manage(ScrcpyState {
                sessions: Mutex::new(HashMap::new()),
                session_generations: Mutex::new(HashMap::new()),
                active_device: Mutex::new(None),
            });

            // Ctrl+Alt+Shift+C (recentre the active mirror window) on every
            // platform, plus Ctrl+Alt+Shift+W (drag the borderless window) on
            // Windows. Non-fatal if a shortcut fails to register.
            if let Err(e) = shortcuts::register(app.handle()) {
                eprintln!("[shortcuts] failed to register global shortcuts: {e}");
            }

            // Linux: drop GTK's client-side decorations and let the webview
            // draw the titlebar (Header.tsx renders the minimize/maximize/
            // close buttons itself). Inside the AppImage the GTK CSD cannot
            // resolve the host icon theme and showed broken glyphs; native
            // decorations stay enabled on Windows/macOS.
            #[cfg(target_os = "linux")]
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_decorations(false);
            }

            // Windows-only: start the drag-follow thread backing Ctrl+Alt+Shift+W.
            #[cfg(target_os = "windows")]
            grab::register(app.handle());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::check_scrcpy,
            commands::get_devices,
            commands::adb_connect,
            commands::get_mdns_devices,
            commands::adb_pair,
            commands::adb_shell,
            commands::push_file,
            commands::install_apk,
            commands::kill_adb,
            commands::run_scrcpy,
            commands::stop_scrcpy,
            commands::recenter_scrcpy_window,
            commands::set_active_device,
            commands::download_scrcpy,
            commands::list_scrcpy_options,
            commands::get_render_drivers,
            commands::get_videos_dir,
            commands::save_report,
            commands::get_scrcpy_bin_dir,
            commands::run_terminal_command,
            commands::check_scrcpy_update,
            commands::open_app_release,
            commands::goto_wireless
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Kill every registered child + drop the mic sink on exit, so closing
    // the app cannot leave sessions (or audio) running in the background.
    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            commands::teardown_sessions(app_handle);
        }
    });
}
