/**
 * Runtime Reanimated animation builders.
 *
 * The compiler bakes `entering-*` / `exiting-*` / `layout-*` utilities into
 * `--reanimated-*` custom properties (see `src/compiler/reanimated.ts`). Here we
 * read those properties back and reconstruct the corresponding
 * `react-native-reanimated` animation object on the JS side — the only place
 * Reanimated entering/exiting/layout animations can be created. The C++ engine
 * deliberately does **not** drive these (they live on the JS/UI thread).
 *
 * `react-native-reanimated` is an optional peer dependency: every entry point
 * degrades to `undefined` when it isn't installed, so apps that don't use
 * animations pay nothing and never import it.
 */

import {
  ENTERING_EXITING_PRESETS,
  LAYOUT_PRESETS,
} from "../compiler/reanimated";

const ENTERING_EXITING_NAMES = new Set<string>(ENTERING_EXITING_PRESETS);
const LAYOUT_NAMES = new Set<string>(LAYOUT_PRESETS);

/** Reanimated animation builder/instance — kept opaque (optional peer dep). */
export type ReanimatedAnimation = unknown;

type AnimationBuilder = {
  duration: (ms: number) => AnimationBuilder;
  delay: (ms: number) => AnimationBuilder;
  springify: () => AnimationBuilder;
  damping: (v: number) => AnimationBuilder;
  stiffness: (v: number) => AnimationBuilder;
  mass: (v: number) => AnimationBuilder;
  easing: (fn: unknown) => AnimationBuilder;
  getDuration: () => number;
};

type EasingModule = {
  linear: unknown;
  quad: unknown;
  bounce: unknown;
  in: (fn: unknown) => unknown;
  out: (fn: unknown) => unknown;
  inOut: (fn: unknown) => unknown;
};

type ReanimatedModule = Record<string, AnimationBuilder> & {
  Easing?: EasingModule;
};

let cached: ReanimatedModule | null | undefined;

/** Lazily resolve `react-native-reanimated`, caching the (possibly null) result. */
function loadReanimated(): ReanimatedModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = require("react-native-reanimated") as ReanimatedModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** Parse a CSS time token (`"300ms"`, `"0.8s"`) into milliseconds. */
export function parseTimeToMs(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const raw = value.replace(/"/g, "").trim();
  if (raw.endsWith("ms")) return Number.parseFloat(raw);
  if (raw.endsWith("s")) return Number.parseFloat(raw) * 1000;
  return Number.parseFloat(raw);
}

export type AnimationPrefix = "entering" | "exiting" | "layout";

export interface AnimationConfig {
  name: string;
  duration?: string;
  delay?: string;
  springify?: string;
  damping?: string;
  stiffness?: string;
  mass?: string;
  easing?: string;
}

/** Read the `--reanimated-<prefix>*` custom props into a config, if present. */
export function extractAnimationConfig(
  vars: Record<string, string>,
  prefix: AnimationPrefix,
): AnimationConfig | undefined {
  const name = vars[`--reanimated-${prefix}`];
  if (!name) return undefined;
  return {
    name,
    duration: vars[`--reanimated-${prefix}-duration`],
    delay: vars[`--reanimated-${prefix}-delay`],
    springify: vars[`--reanimated-${prefix}-springify`],
    damping: vars[`--reanimated-${prefix}-damping`],
    stiffness: vars[`--reanimated-${prefix}-stiffness`],
    mass: vars[`--reanimated-${prefix}-mass`],
    easing: vars[`--reanimated-${prefix}-easing`],
  };
}

const hasAnyConfig = (config: AnimationConfig): boolean =>
  config.duration !== undefined ||
  config.delay !== undefined ||
  config.springify !== undefined ||
  config.damping !== undefined ||
  config.stiffness !== undefined ||
  config.mass !== undefined ||
  config.easing !== undefined;

function easingFor(mod: ReanimatedModule, name: string): unknown {
  const E = mod.Easing;
  if (!E) return undefined;
  switch (name) {
    case "linear":
      return E.linear;
    case "ease-in":
      return E.in(E.quad);
    case "ease-out":
      return E.out(E.quad);
    case "ease-in-out":
      return E.inOut(E.quad);
    case "ease-bounce":
      return E.bounce;
    default:
      return undefined;
  }
}

function createBaseInstance(
  AnimClass: AnimationBuilder,
  duration: number | undefined,
  delay: number | undefined,
): AnimationBuilder {
  if (duration !== undefined) {
    const inst = AnimClass.duration(duration);
    return delay !== undefined ? inst.delay(delay) : inst;
  }
  if (delay !== undefined) return AnimClass.delay(delay);
  return AnimClass.duration(AnimClass.getDuration());
}

function applyComplexConfig(
  mod: ReanimatedModule,
  instance: AnimationBuilder,
  config: AnimationConfig,
): AnimationBuilder {
  let result = instance;
  if (config.springify) result = result.springify();
  if (config.damping !== undefined)
    result = result.damping(Number(config.damping));
  if (config.stiffness !== undefined)
    result = result.stiffness(Number(config.stiffness));
  if (config.mass !== undefined) result = result.mass(Number(config.mass));
  if (config.easing !== undefined) {
    const easing = easingFor(mod, config.easing);
    if (easing !== undefined) result = result.easing(easing);
  }
  return result;
}

function buildEnteringExiting(
  vars: Record<string, string>,
  prefix: "entering" | "exiting",
): ReanimatedAnimation {
  const config = extractAnimationConfig(vars, prefix);
  if (!config || !ENTERING_EXITING_NAMES.has(config.name)) return undefined;
  const mod = loadReanimated();
  const AnimClass = mod?.[config.name];
  if (!AnimClass) return undefined;
  if (!hasAnyConfig(config)) return AnimClass;
  const instance = createBaseInstance(
    AnimClass,
    parseTimeToMs(config.duration),
    parseTimeToMs(config.delay),
  );
  return applyComplexConfig(mod, instance, config);
}

/** Build the Reanimated *entering* animation from `--reanimated-entering*`. */
export const buildEnteringAnimation = (
  vars: Record<string, string>,
): ReanimatedAnimation => buildEnteringExiting(vars, "entering");

/** Build the Reanimated *exiting* animation from `--reanimated-exiting*`. */
export const buildExitingAnimation = (
  vars: Record<string, string>,
): ReanimatedAnimation => buildEnteringExiting(vars, "exiting");

/** Build the Reanimated *layout* transition from `--reanimated-layout*`. */
export function buildLayoutAnimation(
  vars: Record<string, string>,
): ReanimatedAnimation {
  const config = extractAnimationConfig(vars, "layout");
  if (!config || !LAYOUT_NAMES.has(config.name)) return undefined;
  const mod = loadReanimated();
  const LayoutClass = mod?.[config.name];
  if (!LayoutClass) return undefined;
  if (!hasAnyConfig(config)) return LayoutClass;
  const instance = createBaseInstance(
    LayoutClass,
    parseTimeToMs(config.duration),
    parseTimeToMs(config.delay),
  );
  // Only `LinearTransition` exposes the spring/easing configuration builders.
  if (config.name === "LinearTransition") {
    return applyComplexConfig(mod, instance, config);
  }
  return instance;
}

/** Whether any `--reanimated-*` entering/exiting/layout var is present. */
export const hasReanimatedVars = (vars: Record<string, string>): boolean =>
  vars["--reanimated-entering"] !== undefined ||
  vars["--reanimated-exiting"] !== undefined ||
  vars["--reanimated-layout"] !== undefined;
