/**
 * A subset of Metro's config we touch. Kept loose so we don't pin to a specific
 * `metro-config` version.
 */
export interface MetroConfigLike {
    transformerPath?: string;
    transformer?: Record<string, unknown>;
    resolver?: {
        sourceExts?: string[];
        [key: string]: unknown;
    };
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
/**
 * Wrap a Metro config so that importing the nitrowind stylesheet compiles your
 * Tailwind classes (build-time) and injects the resulting style tables via
 * `registerSerializedStyles`. The native C++ engine consumes the same tables.
 *
 * @example
 * // metro.config.js
 * const { getDefaultConfig } = require('expo/metro-config')
 * const { withNitrowindMetroConfig } = require('nitrowind/metro')
 * module.exports = withNitrowindMetroConfig(getDefaultConfig(__dirname), {
 *   input: './global.css',
 * })
 */
export declare function withNitrowindMetroConfig(config: MetroConfigLike, options: NitrowindMetroOptions): MetroConfigLike;
export default withNitrowindMetroConfig;
//# sourceMappingURL=index.d.ts.map