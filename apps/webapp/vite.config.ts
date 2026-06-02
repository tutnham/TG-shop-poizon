import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.VERCEL
  ? path.resolve(rootDir, "../../dist")
  : path.resolve(rootDir, "dist");

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: {
      "@poizon-shop/shared": path.resolve(
        rootDir,
        "../../packages/shared/src/index.ts",
      ),
    },
  },
  build: {
    outDir,
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/health": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
