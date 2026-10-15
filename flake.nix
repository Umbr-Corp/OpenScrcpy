{
  description = "OpenScrcpy Native NixOS Flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        pname = "openscrcpy";
        version = "1.0.0-beta";

        # Fetch the source code from GitHub.
        # NOTE: refresh `hash` after pushing (nix flake update).
        src = pkgs.fetchFromGitHub {
          owner = "yanhenrique-dev";
          repo = "OpenScrcpy";
          rev = "v${version}";
          hash = "sha256-BvkfgCL+C5TxORfW9Bl6lyHGpR30G9RiLxmms5ug5H8=";
        };

        # Build the React Frontend
        frontend = pkgs.buildNpmPackage {
          pname = "${pname}-ui";
          inherit version src;

          npmDepsHash = "sha256-wkR4w+8gmy1wuqWAFVz/bZGCmwwX2MsK7sibyYQZYaU=";

          doCheck = false;

          installPhase = ''
            mkdir -p $out
            cp -r dist/* $out/
          '';
        };

      in
      {
        packages.default = pkgs.rustPlatform.buildRustPackage {
          inherit pname version src;

          sourceRoot = "source/src-tauri";
          cargoHash = "sha256-mQ854X0sIQJemJQuVQq+I/iQlCH7yfg79wOU35jUyR8=";

          nativeBuildInputs = with pkgs; [
            pkg-config
            wrapGAppsHook3
            jq
            copyDesktopItems
          ];

          buildInputs = with pkgs; [
            webkitgtk_4_1
            gtk3
            cairo
            gdk-pixbuf
            glib
            glib-networking
            dbus
            openssl_3
            librsvg
            libsoup_3
          ];

          preBuild = ''
            mkdir -p dist
            cp -r ${frontend}/* dist/

            # Scrub devUrl and command hooks from tauri.conf.json.
            jq '.build.frontendDist = "dist" | del(.build.beforeBuildCommand, .build.beforeDevCommand, .build.devUrl)' tauri.conf.json > tauri.conf.json.tmp
            mv tauri.conf.json.tmp tauri.conf.json
          '';

          desktopItems = [
            (pkgs.makeDesktopItem {
              name = "openscrcpy";
              exec = "openscrcpy";
              icon = "openscrcpy";
              desktopName = "OpenScrcpy";
              comment = "A modern GUI for Scrcpy written in React and Rust";
              categories = [
                "Utility"
                "Development"
              ];
            })
          ];

          postInstall = ''
            # Install the standard sized icons
            for size in 32 64 128; do
              install -Dm644 icons/''${size}x''${size}.png $out/share/icons/hicolor/''${size}x''${size}/apps/openscrcpy.png
            done

            # Install high-resolution icons for GNOME/modern desktops
            install -Dm644 icons/128x128@2x.png $out/share/icons/hicolor/256x256/apps/openscrcpy.png
            install -Dm644 icons/icon.png $out/share/icons/hicolor/512x512/apps/openscrcpy.png

            # Install a fallback pixmap just in case
            install -Dm644 icons/icon.png $out/share/pixmaps/openscrcpy.png
          '';

          preFixup = ''
            gappsWrapperArgs+=(
              --prefix PATH : "${
                pkgs.lib.makeBinPath [
                  pkgs.scrcpy
                  pkgs.android-tools
                ]
              }"
              --set WEBKIT_DISABLE_COMPOSITING_MODE 1
              --set WEBKIT_DISABLE_DMABUF_RENDERER 1
            )
          '';

          meta = with pkgs.lib; {
            description = "A modern GUI for Scrcpy written in React and Rust";
            homepage = "https://github.com/yanhenrique-dev/OpenScrcpy";
            license = licenses.mit;
            maintainers = [ "yanhenrique-dev" ];
          };
        };
      }
    );
}
