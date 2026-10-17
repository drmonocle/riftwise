# RiftWise icon

"Professor Herald": a bearded Rift Herald with a monocle on the dark tile (TV's pick, 2026-10-17).

- `riftwise-icon.svg`: the source (rounded tile). `riftwise-icon-maskable.svg`: full-bleed, for Android's maskable icon.
- `riftwise-icon-1024.png`: the source rendered at 1024 px (headless Chrome, transparent corners).

Every other size is made from the 1024 px renders with Pillow (LANCZOS): `public/icon.png` (256), `web/icon-192.png`,
`web/icon-512.png`, `web/icon-512-maskable.png`, `web/apple-touch-icon.png` (180, from the maskable one),
`web/favicon.ico` (16/32/48), and the desktop app's `src-tauri/icons/*` (PNG sizes, `icon.ico` 16-256, `icon.icns`).
