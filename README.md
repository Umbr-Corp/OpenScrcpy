<p align="center">
  <img src="icon.png" width="128" height="128" alt="OpenScrcpy Icon">
  <br>
  <h1>OpenScrcpy</h1>
  <strong>Control your Android from the desktop — mirror, camera, and virtual display in one clean dashboard.</strong>
  <br><br>
  <code>v1.0.0-beta</code> · <code>MIT</code> · <code>Linux / Windows / macOS</code>
</p>

---

## Screenshots

| Light | Dark |
| ----- | ---- |
| ![OpenScrcpy main window in light mode](docs/screenshots/main-light.png) | ![OpenScrcpy main window in dark mode](docs/screenshots/main-dark.png) |

---

## Features

- **Mirror, Camera & Desktop modes** — screen mirroring, phone-as-webcam with lens/torch/zoom controls, and a virtual display with flex resize.
- **Precision input (OTG/HID)** — hardware keyboard and mouse simulation, side by side, for lag-free control.
- **Wireless pairing & history** — pair Android 11+ devices over Wi-Fi and reconnect in one click.
- **One-click core setup** — automatic core binary download and update checks, right from the header.
- **Render driver selection** — capability-aware, OS-filtered graphics backends.
- **Drag & drop files** — drop an APK to install it, or push any file to `/sdcard/Download/`.

---

## Quick Start

1. Download the latest release from [Releases](https://github.com/yanhenrique-dev/OpenScrcpy/releases).
2. Enable **USB debugging** on your Android device (plus **Wireless debugging** for Wi-Fi connections).
3. Follow the full walkthrough in [GUIDE.md](GUIDE.md).

---

## Development

### Prerequisites
- A JavaScript runtime (v18 or newer)
- The Rust toolchain and Cargo
- The desktop framework's OS-level prerequisites

### Build Instructions
1. `npm install`
2. `npm run tauri dev` (Development)
3. `npm run tauri build` (Production)

## ❄️ NixOS Installation (flakes)

To install it permanently with a desktop launcher, add the flake to your system's `flake.nix`:

```nix
inputs.openscrcpy.url = "github:yanhenrique-dev/OpenScrcpy";
```

Then add it to your system packages:

```nix
environment.systemPackages = [
  inputs.openscrcpy.packages.${pkgs.system}.default
];
```
---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
