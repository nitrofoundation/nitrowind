import type { HybridObject } from "react-native-nitro-modules";
import type { DiagnosticUpdate } from "./types";

/**
 * Optional debugging hooks. When enabled on the `ShadowRegistry`, emits events
 * for node link/unlink and every shadow-tree mutation, with timing.
 */
export interface NitroCssDiagnostics extends HybridObject<{
  ios: "c++";
  android: "c++";
}> {
  onShadowNodeRegistered(
    listener: (tag: number, className: string, count: number) => void,
  ): void;
  onShadowNodeUnregistered(
    listener: (tag: number, count: number) => void,
  ): void;
  onShadowTreeUpdate(listener: (updates: DiagnosticUpdate[]) => void): void;
}
