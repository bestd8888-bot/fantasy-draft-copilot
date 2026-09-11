/**
 * Builds the three extension entry points into dist/.
 *
 * MV3 content scripts cannot be ES modules, so each entry is built separately in
 * Vite library mode (IIFE) instead of one multi-entry build that would emit
 * shared chunks with import statements.
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(root, "dist");
const watch = process.argv.includes("--watch");

const alias = { "@": path.join(root, "src") };

function libConfig(name, entry, extraDefine = {}) {
  return {
    root,
    resolve: { alias },
    plugins: [react()],
    define: { "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production"), ...extraDefine },
    build: {
      outDir,
      emptyOutDir: false,
      sourcemap: watch ? "inline" : false,
      minify: !watch,
      cssCodeSplit: false,
      watch: watch ? {} : null,
      lib: { entry: path.join(root, entry), formats: ["iife"], name, fileName: () => `${name}.js` },
      rollupOptions: { output: { extend: true, assetFileNames: `${name}.[ext]` } },
    },
  };
}

const optionsConfig = {
  root: path.join(root, "src/options"),
  base: "./",
  resolve: { alias },
  plugins: [react()],
  build: {
    outDir: path.join(outDir, "options"),
    emptyOutDir: true,
    minify: !watch,
    watch: watch ? {} : null,
    rollupOptions: { input: path.join(root, "src/options/index.html") },
  },
};

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

await build(libConfig("content", "src/content/index.tsx"));
await build(libConfig("background", "src/background/serviceWorker.ts"));
await build(optionsConfig);
await cp(path.join(root, "public"), outDir, { recursive: true });

console.log(`\n✔ extension built -> ${outDir}${watch ? " (watching)" : ""}`);
