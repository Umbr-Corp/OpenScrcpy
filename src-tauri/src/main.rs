// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // On Plasma Wayland, let KWin draw the titlebar (server-side decorations):
    // GTK's client-side decorations launched from an AppImage can't resolve
    // the host's Breeze icon theme, and the titlebar buttons render as broken
    // minimal glyphs. GNOME draws its own CSD, so scope this to KDE.
    if std::env::var("XDG_CURRENT_DESKTOP")
        .map(|d| d.to_uppercase().contains("KDE"))
        .unwrap_or(false)
    {
        std::env::set_var("GTK_CSD", "0");
    }

    open_scrcpy_lib::run()
}
