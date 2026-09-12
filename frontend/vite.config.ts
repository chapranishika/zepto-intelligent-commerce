import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-router-dom")) return "router";
            if (id.includes("/react/") || id.includes("/react-dom/")) return "react";
            if (id.includes("zustand")) return "store";
            return undefined; // other node_modules fall into the default vendor chunk
          }
          // The static 5,060-item product catalogue is data, not app code — its
          // own chunk means editing app code (or the catalogue itself) doesn't
          // invalidate the other's cache, and Vercel serves /assets/* with a
          // 1-year immutable Cache-Control (vercel.json), so returning visitors
          // skip re-downloading this chunk entirely as long as it's unchanged.
          if (id.includes("src/lib/products")) return "catalogue";
        },
      },
    },
    chunkSizeWarningLimit: 1200, // the catalogue chunk is data-heavy by nature; not a code-splitting miss
  },
});
