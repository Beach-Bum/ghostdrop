import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    port: 3000,
    proxy: {
      // ── Codex local node proxy ─────────────────────────────────
      // Browsers block cross-origin requests to localhost.
      // In dev, all /codex-api/* calls proxy to the local Codex node.
      // The service layer uses "/codex-api" as base URL in dev mode.
      "/codex-api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/codex-api/, ""),
        configure: (proxy) => {
          proxy.on("error", (err) => {
            if (err.code !== "ECONNREFUSED") {
              console.error("[Codex proxy]", err.message);
            }
          });
        },
      },
      // ── Nomos RPC proxy ────────────────────────────────────────
      "/nomos-rpc": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nomos-rpc/, ""),
        configure: (proxy) => {
          proxy.on("error", (err) => {
            if (err.code !== "ECONNREFUSED") {
              console.error("[Nomos proxy]", err.message);
            }
          });
        },
      },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          "waku":   ["@waku/sdk"],
          "codex":  ["@codex-storage/sdk-js", "@codex-storage/sdk-js/browser"],
          "crypto": ["@noble/ciphers", "@noble/curves", "@noble/hashes"],
          "strip":  ["pdf-lib", "exifr", "fflate"],
          "react":  ["react", "react-dom"],
        },
      },
    },
  },

  optimizeDeps: {
    include: [
      "react", "react-dom",
      "@codex-storage/sdk-js",
      "@codex-storage/sdk-js/browser",
    ],
    exclude: ["@waku/sdk"],
  },

  define: {
    global: "globalThis",
  },
});
