"use strict";

import { NitroModules } from "react-native-nitro-modules";
import "./NativeTurboNitrowind.js";
/**
 * Singleton HybridObjects (created once).
 */
export const Config = NitroModules.createHybridObject("NitrowindConfig");
export const Runtime = NitroModules.createHybridObject("NitrowindRuntime");
export const Registry = NitroModules.createHybridObject("ShadowRegistry");
export const Platform = NitroModules.createHybridObject("NativePlatform");
export const Diagnostics = NitroModules.createHybridObject("NitrowindDiagnostics");

/**
 * Per-instance HybridObjects (created on demand, one per linked node/style).
 */
export const createShadowNodeHandle = () => NitroModules.createHybridObject("ShadowNodeHandle");
export const createFollyStyle = () => NitroModules.createHybridObject("FollyStyle");
export * from "./types.js";
//# sourceMappingURL=index.js.map