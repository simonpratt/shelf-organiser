/// <reference types="vitest/config" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The speech worker (src/speech/worker.ts) is a module worker with its own chunks.
  worker: { format: "es" },
  server: {
    host: true,
    // As the Go server sends them, so the speech worker gets threads in dev too.
    headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" },
    proxy: { "/api": "http://127.0.0.1:8080" },
  },
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
