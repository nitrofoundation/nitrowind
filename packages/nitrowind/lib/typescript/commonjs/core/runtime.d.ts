import { type RuntimeSnapshot, StyleDependency } from "../specs/types";
/**
 * The JS-side runtime. In native mode it mirrors the engine's snapshot (used
 * for first paint + `useNitrowind`); in fallback mode it is the source of truth
 * and drives re-renders via {@link dependencyEmitter}.
 */
declare class RuntimeManager {
    private themeName;
    private adaptiveThemeFollowsColorScheme;
    private insets;
    private snapshot;
    private started;
    private nativeListenerStarted;
    private nativeSnapshotInitialized;
    private colorSchemeMode;
    private fallbackSubscriptions;
    /** The live snapshot (prefers the native engine when available). */
    get current(): RuntimeSnapshot;
    getThemeName(): string;
    /** Begin observing platform changes. Idempotent. */
    start(): void;
    private cleanupFallbackSubscriptions;
    /** Subscribe JS to runtime changes. Native styling itself does not need this. */
    subscribe(dependencies: StyleDependency[] | undefined, cb: () => void): () => void;
    private startNativeListener;
    /** Update safe-area insets (wired from a SafeAreaProvider, if used). */
    setInsets(insets: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    }): void;
    setTheme(name: string): void;
    setColorScheme(scheme: "light" | "dark" | "system"): void;
    private refresh;
    private resolveColorScheme;
    private resolveThemeName;
    private read;
}
export declare const runtime: RuntimeManager;
export {};
//# sourceMappingURL=runtime.d.ts.map