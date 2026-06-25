import { Platform } from "react-native";
import { toRNValue } from "../compiler/toRNValue";
import { isInsetValue, type InsetValue, type RNStyle } from "../compiler/types";
import {
  ColorScheme,
  type ComponentState,
  type Insets,
  type RuntimeSnapshot,
} from "../specs/types";
import { toList } from "./mask";
import { foldTransform, normalizeShadow } from "./normalize";
import {
  buildEnteringAnimation,
  buildExitingAnimation,
  buildLayoutAnimation,
  hasReanimatedVars,
} from "./reanimated";
import { getArtifact, getArtifactVersion, getClassBuckets } from "./registry";
import type { ContainerQuery, GetStylesResult } from "./types";

const VAR_RE = /var\((--[A-Za-z0-9-_]+)(?:,\s*([^)]+))?\)/g;
const RESOLVE_CACHE_LIMIT = 2000;

const resolveCache = new Map<string, GetStylesResult>();

function boolKey(value: boolean | undefined): string {
  return value ? "1" : "0";
}

function stateKey(state?: Partial<ComponentState>): string {
  if (!state) return "none";
  return [
    boolKey(state.isActive),
    boolKey(state.isFocused),
    boolKey(state.isHovered),
    boolKey(state.isDisabled),
    boolKey(state.isFirstChild),
    boolKey(state.isLastChild),
  ].join("");
}

function snapshotKey(snapshot: RuntimeSnapshot): string {
  return [
    getArtifactVersion(),
    snapshot.currentThemeName,
    snapshot.colorScheme,
    snapshot.orientation,
    snapshot.screen.width,
    snapshot.screen.height,
    snapshot.insets.top,
    snapshot.insets.right,
    snapshot.insets.bottom,
    snapshot.insets.left,
    snapshot.pixelRatio,
    snapshot.fontScale,
    snapshot.rtl ? 1 : 0,
    snapshot.rem,
    snapshot.hairlineWidth,
  ].join("|");
}

function cacheGet(key: string): GetStylesResult | undefined {
  const cached = resolveCache.get(key);
  if (!cached) return undefined;
  resolveCache.delete(key);
  resolveCache.set(key, cached);
  return cached;
}

function cacheSet(key: string, value: GetStylesResult): void {
  resolveCache.set(key, value);
  if (resolveCache.size <= RESOLVE_CACHE_LIMIT) return;
  const oldest = resolveCache.keys().next().value;
  if (oldest !== undefined) resolveCache.delete(oldest);
}

/** Evaluate a dynamic safe-area inset value against the live insets. */
function resolveInset(value: InsetValue, insets: Insets): number {
  return Math.max(insets[value.$inset] + value.add, value.floor);
}

/** Build the effective CSS-variable table for the active theme + color scheme. */
function effectiveVars(snapshot: RuntimeSnapshot): Record<string, string> {
  const artifact = getArtifact();
  if (!artifact) return {};
  const defaultTheme = artifact.themes[artifact.themeNames[0] ?? ""] ?? {};
  const activeTheme = artifact.themes[snapshot.currentThemeName] ?? {};
  const base = { ...defaultTheme, ...activeTheme };
  if (
    snapshot.currentThemeName !== "light" &&
    snapshot.currentThemeName !== "dark"
  )
    return base;
  const scheme =
    snapshot.colorScheme === ColorScheme.Dark
      ? artifact.themes["dark"]
      : artifact.themes["light"];
  return scheme ? { ...base, ...scheme } : base;
}

function resolveVarsInString(
  value: string,
  vars: Record<string, string>,
): string {
  return value.replace(VAR_RE, (_, name: string, fallback?: string) => {
    return vars[name] ?? fallback?.trim() ?? "";
  });
}

/**
 * Whether a bucket's platform variant applies on the current device. `native`
 * matches every non-web platform; an absent platform applies everywhere. The
 * platform never changes at runtime, so this needs no dependency flag.
 */
function platformApplies(platform: string | undefined): boolean {
  if (!platform) return true;
  const os = Platform.OS;
  if (platform === "native") return os !== "web";
  if (platform === "web") return os === "web";
  return os === platform;
}

/** Whether a compiled bucket's variant applies to the current snapshot. */
function variantApplies(
  variant: string,
  snapshot: RuntimeSnapshot,
  state?: Partial<ComponentState>,
): boolean {
  switch (variant) {
    case "base":
    case "responsive":
      return true;
    case "dark":
      return snapshot.colorScheme === ColorScheme.Dark;
    case "light":
      return snapshot.colorScheme === ColorScheme.Light;
    case "hover":
      return Boolean(state?.isHovered);
    case "focus":
    case "focus-visible":
    case "focus-within":
      return Boolean(state?.isFocused);
    case "active":
      return Boolean(state?.isActive);
    case "disabled":
      return Boolean(state?.isDisabled);
    case "enabled":
      return state ? !state.isDisabled : true;
    case "first":
      return Boolean(state?.isFirstChild);
    case "last":
      return Boolean(state?.isLastChild);
    case "before":
    case "after":
      return false;
    case "unsupported-pseudo":
      return false;
    default:
      return true;
  }
}

/**
 * Resolve a `className` string into a flat RN style object plus the dependency
 * mask describing which runtime signals would require recomputation. This is
 * the same resolution the native engine performs in C++, mirrored in JS for the
 * initial render and the fallback path.
 */
function resolveStylesUncached(
  className: string,
  snapshot: RuntimeSnapshot,
  state?: Partial<ComponentState>,
): GetStylesResult {
  const tokens = className.split(/\s+/).filter(Boolean);
  const styles: RNStyle = {};
  const beforeStyle: RNStyle = {};
  const afterStyle: RNStyle = {};
  let dependencyMask = 0;
  let isAnimated = false;
  let container: GetStylesResult["container"];
  let containerQueries: ContainerQuery[] | undefined;
  // Accumulated `--reanimated-*` custom props (entering/exiting/layout config).
  const reanimatedVars: Record<string, string> = {};

  if (tokens.length === 0) {
    return { styles, dependencyMask, dependencies: [], isAnimated };
  }

  const vars = effectiveVars(snapshot);
  const rem = getArtifact()?.rem ?? 16;

  // Apply one bucket's raw style values (vars/insets resolved) onto `target`.
  const applyBucketStyle = (target: RNStyle, bucketStyle: RNStyle): void => {
    for (const [prop, value] of Object.entries(bucketStyle)) {
      // Reanimated entering/exiting/layout config rides on `--reanimated-*`
      // custom props: collect them for the animation builders and keep them out
      // of the RN style object (they aren't valid style keys).
      if (prop.startsWith("--reanimated-")) {
        if (typeof value === "string") reanimatedVars[prop] = value;
        isAnimated = true;
        continue;
      }
      if (prop.startsWith("transition") || prop === "animationName") {
        isAnimated = true;
      }
      if (isInsetValue(value)) {
        target[prop] = resolveInset(value, snapshot.insets);
        continue;
      }
      if (typeof value === "string" && value.includes("var(")) {
        const resolved = resolveVarsInString(value, vars);
        target[prop] = toRNValue(prop, resolved, { rem }) ?? resolved;
      } else {
        target[prop] = value;
      }
    }
  };

  for (const token of tokens) {
    const buckets = getClassBuckets(token);
    if (!buckets) continue;

    for (const bucket of buckets) {
      // Platform never changes at runtime, so non-matching buckets contribute
      // nothing — skip them before accumulating dependencies.
      if (!platformApplies(bucket.platform)) continue;
      dependencyMask |= bucket.dependencies;

      // This class makes its node a queryable container.
      if (bucket.containerMarker) container = bucket.containerMarker;

      // Container-gated bucket: evaluated against the container's measured size
      // (natively, or by the JS fallback after layout) — never at first paint.
      if (bucket.container) {
        const cqStyle: RNStyle = {};
        applyBucketStyle(cqStyle, bucket.style);
        foldTransform(cqStyle);
        normalizeShadow(cqStyle);
        (containerQueries ??= []).push({
          condition: bucket.container,
          style: cqStyle,
        });
        continue;
      }

      if (bucket.variant === "before" || bucket.variant === "after") {
        applyBucketStyle(
          bucket.variant === "before" ? beforeStyle : afterStyle,
          bucket.style,
        );
        continue;
      }

      if (!variantApplies(bucket.variant, snapshot, state)) continue;
      applyBucketStyle(styles, bucket.style);
    }
  }

  // Fold per-axis transform props (translateX, rotate, scaleX, …) into RN's
  // single `transform` array now that every matching class has been merged.
  foldTransform(styles);
  foldTransform(beforeStyle);
  foldTransform(afterStyle);
  normalizeShadow(styles);
  normalizeShadow(beforeStyle);
  normalizeShadow(afterStyle);

  // Rebuild the Reanimated entering/exiting/layout objects on the JS side from
  // the accumulated `--reanimated-*` config (no-op without reanimated).
  const entering = hasReanimatedVars(reanimatedVars)
    ? buildEnteringAnimation(reanimatedVars)
    : undefined;
  const exiting = hasReanimatedVars(reanimatedVars)
    ? buildExitingAnimation(reanimatedVars)
    : undefined;
  const layout = hasReanimatedVars(reanimatedVars)
    ? buildLayoutAnimation(reanimatedVars)
    : undefined;

  return {
    styles,
    ...(Object.keys(beforeStyle).length > 0 ? { beforeStyle } : {}),
    ...(Object.keys(afterStyle).length > 0 ? { afterStyle } : {}),
    dependencyMask,
    dependencies: toList(dependencyMask),
    isAnimated,
    ...(container ? { container } : {}),
    ...(containerQueries ? { containerQueries } : {}),
    ...(entering ? { entering } : {}),
    ...(exiting ? { exiting } : {}),
    ...(layout ? { layout } : {}),
  };
}

export function resolveStyles(
  className: string,
  snapshot: RuntimeSnapshot,
  state?: Partial<ComponentState>,
): GetStylesResult {
  const key = `${snapshotKey(snapshot)}|${stateKey(state)}|${className}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const resolved = resolveStylesUncached(className, snapshot, state);
  cacheSet(key, resolved);
  return resolved;
}
