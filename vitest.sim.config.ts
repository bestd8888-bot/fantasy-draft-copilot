import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

/** Draft-strategy simulations: slow and exploratory, kept out of `npm test`. */
export default mergeConfig(
  base,
  defineConfig({ test: { include: ["scripts/**/*.test.ts"], testTimeout: 600_000 } }),
);
