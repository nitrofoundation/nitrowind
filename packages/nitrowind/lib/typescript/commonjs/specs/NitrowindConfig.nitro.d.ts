import type { HybridObject } from "react-native-nitro-modules";
/**
 * One-time configuration / bootstrap surface. Receives the compiled style
 * tables from the build step and exposes the active theme.
 */
export interface NitrowindConfig extends HybridObject<{
    ios: "c++";
    android: "c++";
}> {
    readonly hasAdaptiveThemes: boolean;
    readonly currentTheme: string;
    /** Set the active theme. */
    setTheme(themeName: string): void;
    /**
     * Ship the compiled `className -> style` + theme-variable tables to the
     * engine as a serialized JSON blob (produced by the build-time compiler).
     */
    setCompiledStyles(json: string): void;
}
//# sourceMappingURL=NitrowindConfig.nitro.d.ts.map