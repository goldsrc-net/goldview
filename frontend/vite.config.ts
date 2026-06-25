import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// Tauri expects a fixed port and its own env prefix.
export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    target: "esnext",
    sourcemap: true,
  },
});
