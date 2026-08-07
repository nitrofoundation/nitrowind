import type {
  HybridView,
  HybridViewMethods,
  HybridViewProps,
} from "react-native-nitro-modules";

/**
 * The engine's own native backdrop-filter surface: an absolutely-filling view
 * that blurs whatever is rendered BEHIND it (true CSS `backdrop-filter`
 * semantics — the one thing RN's `filter` prop cannot express; folding
 * backdrop-filter into `filter` would blur the view's own content instead).
 *
 * Fed by the `--nitrocss-backdrop-filter` marker the compiler emits for
 * `backdrop-filter` / `-webkit-backdrop-filter` declarations (see
 * `nitro-css/src/compiler/parsers/filter.ts`). The JS side extracts the blur
 * radius from the marker's parsed filter array (`backdropBlurRadius`).
 *
 * v1 scope: blur only.
 * - iOS: `UIVisualEffectView` + the paused-`UIViewPropertyAnimator`
 *   `fractionComplete` technique for a numeric radius (public API only).
 * - Android: graceful stub (renders nothing) — no public backdrop primitive;
 *   see `HybridBackdropView.kt` for the RenderEffect-snapshot TODO.
 * - Non-blur backdrop functions (brightness/saturate/…) are ignored for now
 *   (TODO documented in `backdropBlurRadius`).
 */
export interface BackdropViewProps extends HybridViewProps {
  /**
   * CSS blur radius in dp/pt (e.g. `backdrop-blur-md` → 12). `0` disables the
   * effect entirely.
   */
  blurRadius: number;
  /**
   * The parent view's uniform corner radius (dp/pt) so the blur surface
   * self-clips to the same rounded rect (belt-and-braces on top of the
   * parent's `overflow: hidden`) — same convention as `GradientView`.
   */
  borderRadius: number;
}

export interface BackdropViewMethods extends HybridViewMethods {}

export type BackdropView = HybridView<
  BackdropViewProps,
  BackdropViewMethods,
  { ios: "swift"; android: "kotlin" }
>;
