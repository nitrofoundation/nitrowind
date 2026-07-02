import type { HybridObject } from "react-native-nitro-modules";
import type { GradientView } from "./GradientView.nitro";

/**
 * Native theme reactivity for gradient views (locked decision: NATIVE — no JS
 * re-render). JS links each mounted gradient view's hybrid object together with
 * the owning component's `className`; the C++ engine listens for dependency
 * changes (Theme / ColorScheme / …), re-folds the gradient descriptor for that
 * className, and pushes the new colors/geometry straight into the hybrid view's
 * typed setters — the Swift/Kotlin view batches them onto the main thread and
 * repaints. React never re-renders.
 */
export interface GradientRegistry
  extends HybridObject<{ ios: "c++"; android: "c++" }> {
  /**
   * Start engine-owned updates for a mounted gradient view. `className` is the
   * owning component's full class string — the engine resolves it and extracts
   * the folded `--nitrowind-gradient` descriptor on every dependency change.
   */
  link(view: GradientView, className: string): void;

  /** Stop engine-owned updates for a gradient view (on unmount). */
  unlink(view: GradientView): void;
}
