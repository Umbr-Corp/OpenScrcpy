<div align="center">

<img src="icon.png" width="128" height="128" alt="OpenScrcpy Icon">

# OpenScrcpy

**Control your Android from the desktop. Mirror the screen, use it as a webcam, or open a virtual display.**

`v1.0.5` · `MIT` · `Linux / Windows / macOS`

[![Donate on Liberapay](https://img.shields.io/liberapay/goal/mryofc.svg?logo=liberapay)](https://pt.liberapay.com/mryofc/)

</div>

---

## Screenshots

| Light | Dark |
| ----- | ---- |
| ![OpenScrcpy main window in light mode](docs/screenshots/main-light.png) | ![OpenScrcpy main window in dark mode](docs/screenshots/main-dark.png) |

---

## Features

- **Mirror, camera and desktop modes** — screen mirroring, phone-as-webcam with lens, torch and zoom controls, and a virtual display with flex resize.
- **Precision input over OTG/HID** — hardware keyboard and mouse simulation, side by side.
- **Wireless pairing with history** — pair Android 11+ devices over Wi-Fi and reconnect in one click.
- **One-click core setup** — automatic core binary download and update checks, right from the header.
- **Render driver selection** — capability-aware graphics backends, filtered by OS.
- **Drag and drop files** — drop an APK to install it, or push any file to `/sdcard/Download/`.

---

## Installation

### Quick start

1. Download the latest release from [Releases](https://github.com/Umbr-Corp/OpenScrcpy/releases).
2. Enable **USB debugging** on your Android device (plus **Wireless debugging** for Wi-Fi connections).
3. Follow the full walkthrough in [GUIDE.md](GUIDE.md) or the [Wiki](https://github.com/Umbr-Corp/OpenScrcpy/wiki).

### NixOS (flakes)

To install it permanently with a desktop launcher, add the flake to your system's `flake.nix`:

```nix
inputs.openscrcpy.url = "github:Umbr-Corp/OpenScrcpy";
```

Then add it to your system packages:

```nix
environment.systemPackages = [
  inputs.openscrcpy.packages.${pkgs.system}.default
];
```

---

## Development

### Prerequisites

- A JavaScript runtime (v18 or newer)
- The Rust toolchain and Cargo
- The desktop framework's OS-level prerequisites

### Build

1. `npm install`
2. `npm run tauri dev` — development
3. `npm run tauri build` — production

---

## Security

Found a vulnerability? Read [SECURITY.md](SECURITY.md) — report it privately, never in a public issue.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
