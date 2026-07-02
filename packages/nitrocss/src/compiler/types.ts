import type { ContainerCondition, ContainerMarker } from "./container";

/**
 * Which runtime values a compiled style depends on. The numeric values are a
 * stable ABI shared by nitrocss, NitroCss's Nitro specs, and the C++ engine.
 */
export enum StyleDependency {
  Theme = 0,
  ColorScheme = 1,
  Dimensions = 2,
  Insets = 3,
  Orientation = 4,
  Rtl = 5,
  FontScale = 6,
  Rem = 7,
  /** A parent container's measured size (container queries). */
  ContainerSize = 8,
  /** A nearest group ancestor's interactive state. */
  GroupState = 9,
}

export type { ContainerCondition, ContainerMarker } from "./container";

/** The four physical inset edges a safe-area value can read. */
export type InsetSide = "top" | "right" | "bottom" | "left";

/**
 * A dynamic value that reads a safe-area inset at resolve time. Produced by the
 * compiler from `env(safe-area-inset-*)` (optionally wrapped in `calc()`/`max()`
 * for the `*-safe-offset-*` / `*-safe-or-*` families) and evaluated against the
 * live runtime insets by both the JS runtime and the native C++ engine as:
 *
 *   value = max(insets[side] + add, floor)
 *
 * Because it carries the `Insets` dependency, the native engine recomputes and
 * commits straight to the ShadowTree when insets change — no React re-render.
 */
export interface InsetValue {
  /** Marker + the edge to read (`top` | `right` | `bottom` | `left`). */
  $inset: InsetSide;
  /** Additive offset in px (`*-safe-offset-n`); 0 otherwise. */
  add: number;
  /** Minimum floor in px (`*-safe-or-n`); 0 otherwise. */
  floor: number;
}

/** A single resolved RN style value. */
export type RNStyleValue =
  | string
  | number
  | readonly (string | number)[]
  | InsetValue
  /** `fontVariant`. */
  | readonly string[]
  /** Transform-axis props folded into `transform` at resolve time. */
  | ReadonlyArray<Record<string, string | number>>
  /** Native `filter` entries. */
  | ReadonlyArray<Record<string, unknown>>
  /** `textShadowOffset` / `shadowOffset`. */
  | { width: number; height: number }
  /** `animationName`: keyframe offset -> resolved step style. */
  | Keyframes;

/** A single CSS `@keyframes` step's resolved RN style. */
export type KeyframeStep = Record<
  string,
  string | number | ReadonlyArray<Record<string, string | number>>
>;

/** A compiled `@keyframes` block: offset (e.g. `"0%"`) -> step style. */
export type Keyframes = Record<string, KeyframeStep>;

/** A flat React Native style object (values already coerced from CSS). */
export type RNStyle = Record<string, RNStyleValue>;

/** Narrow a style value to the dynamic inset descriptor. */
export const isInsetValue = (value: unknown): value is InsetValue =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { $inset?: unknown }).$inset === "string";

/** Bitmask of `StyleDependency` flags. */
export type DependencyMask = number;

/** A single compiled class: its style, the variant it belongs to, and deps. */
export interface CompiledClass {
  /** The RN style props this class contributes. */
  style: RNStyle;
  /** Which runtime values this class reads. */
  dependencies: DependencyMask;
  /**
   * Variant qualifier, if any (e.g. `dark`, `md`, `focus`). `base` means it
   * always applies. The runtime picks the right bucket per snapshot.
   */
  variant: string;
  /**
   * Platform qualifier from a platform variant (`ios:`, `android:`, `web:`,
   * `native:`, `macos:`, `windows:`). Absent means it applies on every
   * platform. The platform never changes at runtime, so this carries no
   * dependency flag — the runtime + native engine simply drop non-matching
   * buckets at resolve time.
   */
  platform?: string;
  /**
   * Container-query condition gating this bucket. When present the bucket only
   * applies while the nearest (or named) container satisfies the condition.
   * Evaluated natively from the container's measured size after layout — never
   * at first paint — so it carries the `ContainerSize` dependency.
   */
  container?: ContainerCondition;
  /**
   * Set when this class turns its node into a queryable container
   * (`@container` / `@container/name`). The node is registered so descendant
   * container queries can read its size.
   */
  containerMarker?: ContainerMarker;
}

/** The full output artifact consumed by the runtime + native engine. */
export interface CompiledArtifact {
  /** `className -> list of compiled buckets` (one per matching variant). */
  classes: Record<string, CompiledClass[]>;
  /** `themeName -> (cssVarName -> resolved value)`. */
  themes: Record<string, Record<string, string>>;
  /** All theme names discovered, in declaration order. */
  themeNames: string[];
  /** Root rem value in px (default 16). */
  rem: number;
}

export interface CompileOptions {
  /** Path to the entry stylesheet (plain CSS with `@theme` blocks). */
  input: string;
  /** Globs/paths to scan for `className` candidates. */
  content: string[];
  /** Project root used to resolve relative paths. */
  cwd?: string;
  /** Override the default rem (16). */
  rem?: number;
}

