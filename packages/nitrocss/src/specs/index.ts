import { NitroModules } from "react-native-nitro-modules";
import "./NativeTurboNitroCss";

import type { FollyStyle } from "./FollyStyle.nitro";
import type { NativePlatform } from "./NativePlatform.nitro";
import type { NitroCssConfig } from "./NitroCssConfig.nitro";
import type { NitroCssDiagnostics } from "./NitroCssDiagnostics.nitro";
import type { NitroCssRuntime } from "./NitroCssRuntime.nitro";
import type { ShadowNodeHandle } from "./ShadowNodeHandle.nitro";
import type { ShadowRegistry } from "./ShadowRegistry.nitro";

/**
 * Singleton HybridObjects (created once).
 */
export const Config =
  NitroModules.createHybridObject<NitroCssConfig>("NitroCssConfig");
export const Runtime =
  NitroModules.createHybridObject<NitroCssRuntime>("NitroCssRuntime");
export const Registry =
  NitroModules.createHybridObject<ShadowRegistry>("ShadowRegistry");
export const Platform =
  NitroModules.createHybridObject<NativePlatform>("NativePlatform");
export const Diagnostics =
  NitroModules.createHybridObject<NitroCssDiagnostics>("NitroCssDiagnostics");
/**
 * Per-instance HybridObjects (created on demand, one per linked node/style).
 */
export const createShadowNodeHandle = () =>
  NitroModules.createHybridObject<ShadowNodeHandle>("ShadowNodeHandle");
export const createFollyStyle = () =>
  NitroModules.createHybridObject<FollyStyle>("FollyStyle");

export * from "./types";
export type {
  Accent,
  ShadowRegistration,
  ShadowRegistry,
} from "./ShadowRegistry.nitro";
export type {
  ResolveClassNamesPayload,
  NitroCssRuntime,
} from "./NitroCssRuntime.nitro";
export type { NativePlatform } from "./NativePlatform.nitro";
export type { NitroCssConfig } from "./NitroCssConfig.nitro";
export type { NitroCssDiagnostics } from "./NitroCssDiagnostics.nitro";
export type { ShadowNodeHandle } from "./ShadowNodeHandle.nitro";
export type { FollyStyle } from "./FollyStyle.nitro";
export type {
  BackdropView,
  BackdropViewMethods,
  BackdropViewProps,
} from "./BackdropView.nitro";
