import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * React Native's published entry point is Flow-typed, which the test bundler
 * cannot parse. The unit tests that reach `react-native` only need `Platform`,
 * so alias the whole module to a tiny stub (`test/mocks/react-native.ts`).
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^react-native$/,
        replacement: fileURLToPath(
          new URL("./test/mocks/react-native.ts", import.meta.url),
        ),
      },
    ],
  },
});
