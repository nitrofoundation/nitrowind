import type { NativeDiagnosticsSnapshot } from "../specs/types";
import { getEngine, hasNativeEngine } from "./native";

const unavailableSnapshot = (): NativeDiagnosticsSnapshot => ({
  nativeAvailable: false,
  linkedNodes: 0,
  affectedNodes: 0,
  resolvedNodes: 0,
  skippedMutations: 0,
  committedMutations: 0,
  lastResolveDurationMs: 0,
  lastCommitDurationMs: 0,
  totalResolveDurationMs: 0,
  totalCommitDurationMs: 0,
});

/** Read cumulative native resolver and ShadowTree counters. */
export function getNativeDiagnostics(): NativeDiagnosticsSnapshot {
  if (!hasNativeEngine()) return unavailableSnapshot();
  try {
    return getEngine()!.Diagnostics.getSnapshot();
  } catch {
    return unavailableSnapshot();
  }
}

/** Reset native diagnostic counters without affecting linked nodes or styles. */
export function resetNativeDiagnostics(): void {
  if (!hasNativeEngine()) return;
  try {
    getEngine()!.Diagnostics.reset();
  } catch {
    // Diagnostics are optional and must never affect application behavior.
  }
}
