import "./NativeTurboNitrowind";
import type { FollyStyle } from "./FollyStyle.nitro";
import type { NativePlatform } from "./NativePlatform.nitro";
import type { NitrowindConfig } from "./NitrowindConfig.nitro";
import type { NitrowindDiagnostics } from "./NitrowindDiagnostics.nitro";
import type { NitrowindRuntime } from "./NitrowindRuntime.nitro";
import type { ShadowNodeHandle } from "./ShadowNodeHandle.nitro";
import type { ShadowRegistry } from "./ShadowRegistry.nitro";
/**
 * Singleton HybridObjects (created once).
 */
export declare const Config: NitrowindConfig;
export declare const Runtime: NitrowindRuntime;
export declare const Registry: ShadowRegistry;
export declare const Platform: NativePlatform;
export declare const Diagnostics: NitrowindDiagnostics;
/**
 * Per-instance HybridObjects (created on demand, one per linked node/style).
 */
export declare const createShadowNodeHandle: () => ShadowNodeHandle;
export declare const createFollyStyle: () => FollyStyle;
export * from "./types";
export type { Accent, ShadowRegistry } from "./ShadowRegistry.nitro";
export type { ResolveClassNamesPayload, NitrowindRuntime, } from "./NitrowindRuntime.nitro";
export type { NativePlatform } from "./NativePlatform.nitro";
export type { NitrowindConfig } from "./NitrowindConfig.nitro";
export type { NitrowindDiagnostics } from "./NitrowindDiagnostics.nitro";
export type { ShadowNodeHandle } from "./ShadowNodeHandle.nitro";
export type { FollyStyle } from "./FollyStyle.nitro";
//# sourceMappingURL=index.d.ts.map