import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Compat lives OUTSIDE src/ so replacing Base44 pages/components cannot wipe the backend bridge.
const compatSdk = path.resolve(__dirname, "packages/base44-compat");

export default defineConfig({
  logLevel: "error",
  resolve: {
    alias: {
      "@base44/sdk/dist/utils/axios-client": path.join(
        compatSdk,
        "utils/axios-client.js"
      ),
      "@base44/sdk": compatSdk,
      "@": path.resolve(__dirname, "src"),
    },
  },
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
});
