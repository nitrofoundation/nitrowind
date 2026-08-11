import type { CustomType } from "react-native-nitro-modules";

/**
 * A plain JS object passed across the Nitro bridge.
 */
export type AnyObject = Record<string, unknown>;

/**
 * Bridges a React Native ref/shadow-node JS value to a C++
 * `std::shared_ptr<const ShadowNode>`. The conversion is implemented in our
 * hand-written `JSIConverter+ShadowNode.hpp` (see `cpp/jsi/`).
 */
export type ShadowNodeRef = CustomType<
  AnyObject,
  "std::shared_ptr<const facebook::react::ShadowNode>",
  { include: "JSIConverter+ShadowNode.hpp" }
>;

/**
 * Bridges a JS style object to a C++ `folly::dynamic` (aliased `SharedFolly`).
 * Implemented in `JSIConverter+SharedFolly.hpp`.
 */
export type FollyDynamic = CustomType<
  AnyObject,
  "::nitrocss::SharedFolly",
  { include: "JSIConverter+SharedFolly.hpp" }
>;

/**
 * Which runtime values a compiled style depends on. Used as bit positions for a
 * dependency bitmask so the engine only recomputes affected nodes on change.
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

export enum ColorScheme {
  Light = 0,
  Dark = 1,
  Unspecified = 2,
}

export enum Orientation {
  Portrait = 0,
  Landscape = 1,
}

/** Source that triggered a runtime change (for diagnostics/animation). */
export enum RuntimeChangeSource {
  System = 0,
  User = 1,
  Layout = 2,
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Snapshot of all runtime values (mirrors uniwind's `UniwindRuntimeCurrent`).
 */
export interface RuntimeSnapshot {
  colorScheme: ColorScheme;
  hasAdaptiveThemes: boolean;
  currentThemeName: string;
  screen: Dimensions;
  insets: Insets;
  orientation: Orientation;
  pixelRatio: number;
  fontScale: number;
  rtl: boolean;
  rem: number;
  hairlineWidth: number;
}

export interface ThemeConfig {
  themes: string[];
  currentTheme: string;
  hasAdaptiveThemes: boolean;
}

/** Per-component context captured at link time. */
export interface ComponentContext {
  currentThemeName: string;
  colorScheme: ColorScheme;
  rtl: boolean;
}

/** Interactive pseudo-state of a component (focus/active/disabled/hover). */
export interface ComponentState {
  isFocused: boolean;
  isActive: boolean;
  isDisabled: boolean;
  isHovered: boolean;
  isFirstChild: boolean;
  isLastChild: boolean;
}

/** A diagnostic update emitted when the engine mutates the shadow tree. */
export interface DiagnosticUpdate {
  tag: number;
  className: string;
  durationMs: number;
}

/** Cumulative native resolver/ShadowTree counters for development tooling. */
export interface NativeDiagnosticsSnapshot {
  nativeAvailable: boolean;
  linkedNodes: number;
  affectedNodes: number;
  resolvedNodes: number;
  skippedMutations: number;
  committedMutations: number;
  lastResolveDurationMs: number;
  lastCommitDurationMs: number;
  totalResolveDurationMs: number;
  totalCommitDurationMs: number;
}
