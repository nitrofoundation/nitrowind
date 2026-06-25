import path from "node:path";

/**
 * A subset of Metro's config we touch. Kept loose so we don't pin to a specific
 * `metro-config` version.
 */
export interface MetroConfigLike {
  transformerPath?: string;
  transformer?: Record<string, unknown>;
  resolver?: { sourceExts?: string[]; [key: string]: unknown };
  watchFolders?: string[];
  [key: string]: unknown;
}

export interface NitrowindMetroOptions {
  /** Path to the entry stylesheet (`@import "tailwindcss"; @theme { … }`). */
  input: string;
  /** Globs to scan for `className` usage. Defaults to common app/src paths. */
  content?: string[];
  /** Root rem in px. Defaults to 16. */
  rem?: number;
  /** Project root. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Rewrite app imports from `react-native` host components to nitrowind wrappers. Defaults to true. */
  rewriteReactNativeImports?: boolean;
}

const DEFAULT_CONTENT = [
  "./App.{tsx,ts,jsx,js}",
  "./app/**/*.{tsx,ts,jsx,js}",
  "./src/**/*.{tsx,ts,jsx,js}",
  "./components/**/*.{tsx,ts,jsx,js}",
];

const FALLBACK_UPSTREAM = "metro-transform-worker";

/**
 * Wrap a Metro config so that importing the nitrowind stylesheet compiles your
 * Tailwind classes (build-time) and injects the resulting style tables via
 * `registerStyles`. The native C++ engine consumes the same tables.
 *
 * @example
 * // metro.config.js
 * const { getDefaultConfig } = require('expo/metro-config')
 * const { withNitrowindMetroConfig } = require('nitrowind/metro')
 * module.exports = withNitrowindMetroConfig(getDefaultConfig(__dirname), {
 *   input: './global.css',
 * })
 */
export function withNitrowindMetroConfig(
  config: MetroConfigLike,
  options: NitrowindMetroOptions,
): MetroConfigLike {
  const cwd = options.cwd ?? process.cwd();
  const input = path.resolve(cwd, options.input);

  // The transformer worker runs in a separate process, so we pass options via
  // environment variables (the only reliable channel across Metro versions).
  process.env.NITROWIND_INPUT = input;
  process.env.NITROWIND_CONTENT = JSON.stringify(
    options.content ?? DEFAULT_CONTENT,
  );
  process.env.NITROWIND_REM = String(options.rem ?? 16);
  process.env.NITROWIND_CWD = cwd;
  process.env.NITROWIND_REWRITE_REACT_NATIVE_IMPORTS =
    options.rewriteReactNativeImports === false ? "0" : "1";
  // Nitrowind hooks Metro at the *transform worker* layer (the `transformerPath`
  // module — `transform(config, projectRoot, filename, data, options)`), not the
  // babel transformer. This matters on Expo: its worker routes `*.css` through
  // lightningcss *before* the babel transformer runs, so the only place we can
  // intercept the stylesheet and swap it for `registerStyles(...)` is the worker.
  // We stash the upstream worker so our transformer can delegate every other file
  // to it untouched (preserving Expo's asset / CSS / +api / customTransformOptions
  // handling).
  process.env.NITROWIND_UPSTREAM_TRANSFORMER =
    (config.transformerPath as string | undefined) ??
    safeResolve(FALLBACK_UPSTREAM) ??
    FALLBACK_UPSTREAM;

  const sourceExts = config.resolver?.sourceExts ?? [];

  return {
    ...config,
    transformerPath: require.resolve("nitrowind/metro/transformer"),
    transformer: {
      ...config.transformer,
      nitrowindInput: input,
    },
    resolver: {
      ...config.resolver,
      sourceExts: sourceExts.includes("css")
        ? sourceExts
        : [...sourceExts, "css"],
    },
    watchFolders: Array.from(new Set([...(config.watchFolders ?? []), cwd])),
  };
}

function safeResolve(id: string): string | undefined {
  try {
    return require.resolve(id);
  } catch {
    return undefined;
  }
}

export default withNitrowindMetroConfig;
