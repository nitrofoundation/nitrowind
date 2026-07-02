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

export interface NitroCssMetroOptions {
  /** Path to the entry stylesheet (plain CSS). */
  input: string;
  /** Globs to scan for `className` usage. Forwarded to the pipeline. */
  content?: string[];
  /** Root rem in px. Defaults to 16. */
  rem?: number;
  /** Project root. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Rewrite app imports from `react-native` host components to nitrocss wrappers. Defaults to true. */
  rewriteReactNativeImports?: boolean;
  /**
   * Absolute path to a CSS pipeline module (already resolved, e.g. via
   * `require.resolve`). Must export `scan` and `buildCss` (see
   * `NitroCssPipeline` in `./transformer`). Defaults to the built-in
   * plain-CSS pipeline.
   */
  pipeline?: string;
}

const FALLBACK_UPSTREAM = "metro-transform-worker";

/**
 * Wrap a Metro config so that importing the nitrocss stylesheet compiles it
 * (build-time) and injects the resulting style tables via
 * `registerSerializedStyles`. The native C++ engine consumes the same tables.
 *
 * @example
 * // metro.config.js
 * const { getDefaultConfig } = require('expo/metro-config')
 * const { withNitroCssMetroConfig } = require('@nitrofoundation/nitrocss/metro')
 * module.exports = withNitroCssMetroConfig(getDefaultConfig(__dirname), {
 *   input: './global.css',
 * })
 */
export function withNitroCssMetroConfig(
  config: MetroConfigLike,
  options: NitroCssMetroOptions,
): MetroConfigLike {
  const cwd = options.cwd ?? process.cwd();
  const input = path.resolve(cwd, options.input);

  // The transformer worker runs in a separate process, so we pass options via
  // environment variables (the only reliable channel across Metro versions).
  process.env.NITROCSS_INPUT = input;
  process.env.NITROCSS_CONTENT = JSON.stringify(options.content ?? []);
  process.env.NITROCSS_REM = String(options.rem ?? 16);
  process.env.NITROCSS_CWD = cwd;
  process.env.NITROCSS_REWRITE_REACT_NATIVE_IMPORTS =
    options.rewriteReactNativeImports === false ? "0" : "1";
  // Which CSS pipeline the transformer worker loads to scan candidates and
  // build the final CSS. Wrapper packages point this at their own module; the
  // default is the built-in plain-CSS pipeline.
  process.env.NITROCSS_PIPELINE =
    options.pipeline ?? require.resolve("./pipeline");
  // NitroCss hooks Metro at the *transform worker* layer (the `transformerPath`
  // module — `transform(config, projectRoot, filename, data, options)`), not the
  // babel transformer. This matters on Expo: its worker routes `*.css` through
  // lightningcss *before* the babel transformer runs, so the only place we can
  // intercept the stylesheet and swap it for `registerSerializedStyles(...)` is the worker.
  // We stash the upstream worker so our transformer can delegate every other file
  // to it untouched (preserving Expo's asset / CSS / +api / customTransformOptions
  // handling).
  process.env.NITROCSS_UPSTREAM_TRANSFORMER =
    (config.transformerPath as string | undefined) ??
    safeResolve(FALLBACK_UPSTREAM) ??
    FALLBACK_UPSTREAM;

  const sourceExts = config.resolver?.sourceExts ?? [];

  return {
    ...config,
    transformerPath: require.resolve(
      "@nitrofoundation/nitrocss/metro/transformer",
    ),
    transformer: {
      ...config.transformer,
      nitrocssInput: input,
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

export default withNitroCssMetroConfig;
