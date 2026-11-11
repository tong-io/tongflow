# TongFlow Desktop (cloud shell)

The desktop app is a lightweight [Pake](https://github.com/tw93/Pake) (Tauri) shell
that loads **https://app.tongflow.com** in a native WebView. It ships no local
server, database, or Python runtime — all execution happens in the cloud, so the
installer is ~10 MB instead of the ~200 MB of the retired Electron build
(≤ v0.1.13, which bundled a local Next.js server and plugin runtime; use
self-hosting via `pnpm dev` / Docker if you need the fully local experience).

## Building locally

Prerequisites: Node ≥ 22 and Rust ≥ 1.85 (`rustup` — pake-cli offers to install it).

```bash
npm install -g pake-cli

# From the repo root. First build compiles Tauri and takes ~10 minutes.
pake https://app.tongflow.com --name TongFlow \
  --icon desktop/icon-macos.png \
  --width 1440 --height 900 \
  --enable-drag-drop \
  --safe-domain accounts.google.com,github.com,appleid.apple.com,open.weixin.qq.com \
  --camera --microphone \
  --user-agent "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
```

Platform notes:

- **macOS universal** build: add `--targets universal` (requires
  `rustup target add aarch64-apple-darwin x86_64-apple-darwin`).
- **Windows**: add `--targets x64` and use `--icon desktop/icon.png`; drop the `--user-agent` / `--camera` /
  `--microphone` flags (they are macOS concerns — the custom Safari UA works
  around Google's embedded-WebView OAuth block in WKWebView).
- `--safe-domain` keeps the OAuth redirects (Google / GitHub / Apple / WeChat)
  inside the app window instead of bouncing to the external browser.

Releases are built by [`.github/workflows/desktop-release.yml`](../.github/workflows/desktop-release.yml)
on `v*` tags and publish `TongFlow-mac-universal.dmg` and `TongFlow-win-x64.msi`.

## Unsigned builds

Builds are unsigned (same as the old Electron shell). On macOS, first launch
requires right-click → Open, or:

```bash
xattr -cr /Applications/TongFlow.app
```

## Icon

Both icons are the TongFlow square mark (the T with the green play triangle on
the dark rounded square), 1024×1024, exported from
[`public/brand/tongflow-mark.svg`](../public/brand/tongflow-mark.svg):

- `icon-macos.png` keeps about 10% empty margin around the square, as macOS
  app icons do.
- `icon.png` fills the canvas, for Windows.

Pake converts them to `.icns` / `.ico` per platform automatically. The app name
stays **TongFlow**.
