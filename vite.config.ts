import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error same: no @types/node
import fs from "node:fs";
// @ts-expect-error same: no @types/node
import path from "node:path";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
// Web build only: the PWA manifest and home-screen icon tags (meaningless inside the desktop app),
// and the web/ files (service worker, manifest, icons, IIS config) copied next to the bundle.
const webPlugin = {
  name: "riftwatch-web",
  closeBundle: () => {
    for (const f of fs.readdirSync("web")) fs.copyFileSync(path.join("web", f), path.join("dist-web", f));
  },
  transformIndexHtml: (html: string) =>
    html.replace(
      "</head>",
      [
        '    <link rel="manifest" href="/riftwatch/manifest.webmanifest" />',
        '    <link rel="apple-touch-icon" href="/riftwatch/icon-192.png" />',
        '    <meta name="apple-mobile-web-app-capable" content="yes" />',
        '    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
        '    <meta name="apple-mobile-web-app-title" content="RiftWatch" />',
        "  </head>",
      ].join("\n"),
    ),
};

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "web" ? [webPlugin] : [])],

  // `npm run build:web` builds the browser version served at lolworlds.com/riftwatch/
  base: mode === "web" ? "/riftwatch/" : "/",
  build: mode === "web" ? { outDir: "dist-web", emptyOutDir: true } : undefined,

  // `vite preview` of the web build: send the alert API to the live server, as IIS does in production
  preview: { proxy: { "/riftwatch/api": { target: "https://lolworlds.com", changeOrigin: true } } },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
