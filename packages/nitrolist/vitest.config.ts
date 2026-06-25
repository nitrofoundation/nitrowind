import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
