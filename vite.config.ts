import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { VitePWA } from "vite-plugin-pwa"

const require = createRequire(import.meta.url)

// elkjs's elk-worker.min.js is a ~1.6MB GWT-compiled bundle meant to be
// loaded verbatim as a classic Worker's entry script (see
// app/lib/layout/use-elk-layout.ts). Importing it the normal way (`?url`)
// makes Vite's dev server serve it through the JS transform pipeline, which
// injects an inline sourcemap and balloons the response to 10MB+ — the
// Worker that loads it then hangs forever instead of firing
// onmessage/onerror. Emitting it as a raw static asset, both in dev and in
// the production bundle, sidesteps that pipeline entirely.
function elkWorkerAsset(): Plugin {
  const elkWorkerPath = require.resolve("elkjs/lib/elk-worker.min.js")
  return {
    name: "elk-worker-asset",
    configureServer(server) {
      server.middlewares.use("/elk-worker.min.js", (_req, res) => {
        res.setHeader("Content-Type", "text/javascript")
        res.end(readFileSync(elkWorkerPath))
      })
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "elk-worker.min.js",
        source: readFileSync(elkWorkerPath),
      })
    },
  }
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    react(),
    elkWorkerAsset(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      manifest: {
        name: "Family Tree Generator",
        short_name: "Family Tree",
        description:
          "Build and export family trees, entirely offline in your browser.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#bb4d00",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      includeAssets: ["favicon.ico", "icons/apple-touch-icon.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
})
