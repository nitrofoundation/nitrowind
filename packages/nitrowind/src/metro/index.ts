/**
 * Metro integration — a thin wrapper over nitrocss's Metro plugin that plugs
 * in the Tailwind build pipeline (`./pipeline`) and the default content globs.
 *
 * Authored against the CommonJS build (Metro configs are loaded with
 * `require`), which is why the pipeline path is resolved from `__dirname`
 * rather than through this package's own exports map.
 */
import path from "node:path";
import {
  withNitroCssMetroConfig,
  type MetroConfigLike,
} from "@nitrofoundation/nitrocss/metro";

export type { MetroConfigLike } from "@nitrofoundation/nitrocss/metro";

export interface NitrowindMetroOptions {
  /** Path to the entry stylesheet (`@import "tailwindcss"; @theme { … }`). */
  input: string;
  /** Globs to scan for `className` usage. Defaults to common app/src paths. */
  content?: string[];
  /** Root rem in px. Defaults to 16. */
  rem?: number;
  /** Project root. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Rewrite app imports from `react-native` host components to nitrocss wrappers. Defaults to true. */
  rewriteReactNativeImports?: boolean;
}

const DEFAULT_CONTENT = [
  "./App.{tsx,ts,jsx,js}",
  "./app/**/*.{tsx,ts,jsx,js}",
  "./src/**/*.{tsx,ts,jsx,js}",
  "./components/**/*.{tsx,ts,jsx,js}",
];

/**
 * Absolute path to the Tailwind pipeline module handed to the nitrocss
 * transform worker. Resolved relative to this file (built: `pipeline.js`
 * next to `lib/commonjs/metro/index.js`; source/tests: `pipeline.ts`).
 */
function resolvePipeline(): string {
  try {
    return require.resolve(path.join(__dirname, "pipeline"));
  } catch {
    return path.join(__dirname, "pipeline.ts");
  }
}

/**
 * Wrap a Metro config so that importing the nitrowind stylesheet compiles your
 * Tailwind classes (build-time) and injects the resulting style tables via
 * `registerSerializedStyles`. The native C++ engine consumes the same tables.
 *
 * @example
 * // metro.config.js
 * const { getDefaultConfig } = require('expo/metro-config')
 * const { withNitrowindMetroConfig } = require('@nitrofoundation/nitrowind/metro')
 * module.exports = withNitrowindMetroConfig(getDefaultConfig(__dirname), {
 *   input: './global.css',
 * })
 */
export function withNitrowindMetroConfig(
  config: MetroConfigLike,
  options: NitrowindMetroOptions,
): MetroConfigLike {
  return withNitroCssMetroConfig(config, {
    ...options,
    content: options.content ?? DEFAULT_CONTENT,
    pipeline: resolvePipeline(),
  });
}

export default withNitrowindMetroConfig;
