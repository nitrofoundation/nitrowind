import type {
  HybridView,
  HybridViewMethods,
  HybridViewProps,
} from "react-native-nitro-modules";

/**
 * The gradient paint the engine's own native view renders. Mirrors the compact
 * numeric descriptor emitted by `foldGradient` (see
 * `nitrocss/src/compiler/parsers/gradient.ts` and its C++ twin in
 * `nitrocss/cpp/NitroCssEngine.cpp`): no CSS-string parsing happens at paint
 * time — colors are hex strings, stop locations are pre-normalized `0..1`, and
 * geometry is plain numbers.
 */
export type GradientType = "linear" | "radial";

export interface GradientViewProps extends HybridViewProps {
  /** `linear` → CAGradientLayer `.axial` / Android `LinearGradient` shader. */
  gradientType: GradientType;
  /**
   * Linear sweep angle in CSS degrees (0 = to top, 90 = to right,
   * 180 = to bottom). Ignored for radial gradients.
   */
  angle: number;
  /** Radial center X as a fraction of the width (`0..1`, default `0.5`). */
  positionX: number;
  /** Radial center Y as a fraction of the height (`0..1`, default `0.5`). */
  positionY: number;
  /** Stop colors, `#rgb` / `#rrggbb` / `#rrggbbaa` / `transparent`. */
  colors: string[];
  /** Stop offsets in `0..1`, monotonic, same length as `colors`. */
  locations: number[];
  /**
   * The parent view's uniform corner radius (dp/pt) so the paint self-clips to
   * the same rounded rect (belt-and-braces on top of the parent's
   * `overflow: hidden`).
   */
  borderRadius: number;
}

export interface GradientViewMethods extends HybridViewMethods {}

export type GradientView = HybridView<
  GradientViewProps,
  GradientViewMethods,
  { ios: "swift"; android: "kotlin" }
>;
