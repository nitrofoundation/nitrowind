import { NitroModules } from "react-native-nitro-modules";
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
export const Config =
  NitroModules.createHybridObject<NitrowindConfig>("NitrowindConfig");
export const Runtime =
  NitroModules.createHybridObject<NitrowindRuntime>("NitrowindRuntime");
export const Registry =
  NitroModules.createHybridObject<ShadowRegistry>("ShadowRegistry");
export const Platform =
  NitroModules.createHybridObject<NativePlatform>("NativePlatform");
export const Diagnostics =
  NitroModules.createHybridObject<NitrowindDiagnostics>("NitrowindDiagnostics");
/**
 * Per-instance HybridObjects (created on demand, one per linked node/style).
 */
export const createShadowNodeHandle = () =>
  NitroModules.createHybridObject<ShadowNodeHandle>("ShadowNodeHandle");
export const createFollyStyle = () =>
  NitroModules.createHybridObject<FollyStyle>("FollyStyle");

export * from "./types";
export type { Accent, ShadowRegistry } from "./ShadowRegistry.nitro";
export type {
  ResolveClassNamesPayload,
  NitrowindRuntime,
} from "./NitrowindRuntime.nitro";
export type { NativePlatform } from "./NativePlatform.nitro";
export type { NitrowindConfig } from "./NitrowindConfig.nitro";
export type { NitrowindDiagnostics } from "./NitrowindDiagnostics.nitro";
export type { ShadowNodeHandle } from "./ShadowNodeHandle.nitro";
export type { FollyStyle } from "./FollyStyle.nitro";
export type {
  BackdropView,
  BackdropViewMethods,
  BackdropViewProps,
} from "./BackdropView.nitro";
