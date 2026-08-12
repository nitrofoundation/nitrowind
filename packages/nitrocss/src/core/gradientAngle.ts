import { Platform } from "react-native";

/**
 * Runtime-only animated gradient-angle track. The compiler emits this object
 * under the `--nitrocss-gradient-angle` marker (see effects contract). It never
 * reaches RN props or the C++ gradient registry: JS interpolates it per frame
 * and pushes the resulting angle to the native applier through the
 * `global.__nitrocssSetGradientAngle` JSI channel installed by NitroCssInstaller.
 */
export interface GradientAngleKeyframe {
  /** Normalized keyframe offset, 0..1. */
  at: number;
  /** Angle in degrees at this offset. */
  angle: number;
}

export interface GradientAngleTrack {
  durationMs: number;
  delayMs: number;
  /** Repeat count; -1 == infinite. */
  iterations: number;
  direction: "normal" | "reverse" | "alternate" | "alternate-reverse";
  /** CSS easing keyword (best-effort; unknown keywords fall back to linear). */
  easing: string;
  keyframes: GradientAngleKeyframe[];
}

/** The JSI host functions installed on the JS runtime by the native engine. */
declare global {
  // eslint-disable-next-line no-var
  var __nitrocssSetGradientAngle: ((tag: number, angle: number) => void) | undefined;
  // eslint-disable-next-line no-var
  var __nitrocssClearGradientAngle: ((tag: number) => void) | undefined;
}

type EasingFn = (t: number) => number;

/**
 * Minimal easing map — enough for milestone 1. Unknown/`cubic-bezier(...)`
 * keywords fall back to linear (the angle track is typically linear anyway).
 */
const EASINGS: Record<string, EasingFn> = {
  linear: (t) => t,
  ease: (t) => t * t * (3 - 2 * t), // approx smoothstep for the default "ease"
  "ease-in": (t) => t * t,
  "ease-out": (t) => t * (2 - t),
  "ease-in-out": (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
};

function resolveEasing(easing: string | undefined): EasingFn {
  if (!easing) return EASINGS.linear!;
  return EASINGS[easing.trim().toLowerCase()] ?? EASINGS.linear!;
}

/**
 * Interpolate the angle at progress `p` (0..1) across the sorted keyframes.
 * Linear interpolation between neighboring `{at, angle}` pairs; clamps to the
 * first/last keyframe outside the covered range.
 */
function angleAt(keyframes: GradientAngleKeyframe[], p: number): number {
  const n = keyframes.length;
  if (n === 0) return 0;
  if (n === 1) return keyframes[0]!.angle;
  if (p <= keyframes[0]!.at) return keyframes[0]!.angle;
  const last = keyframes[n - 1]!;
  if (p >= last.at) return last.angle;
  for (let i = 1; i < n; i++) {
    const b = keyframes[i]!;
    if (p <= b.at) {
      const a = keyframes[i - 1]!;
      const span = b.at - a.at;
      if (span <= 0) return b.angle;
      const local = (p - a.at) / span;
      return a.angle + (b.angle - a.angle) * local;
    }
  }
  return last.angle;
}

/**
 * Map an iteration's linear progress (0..1) through the direction rule.
 * `iterationIndex` is the completed-iteration count (0-based) used by the
 * alternating directions to decide whether the current pass runs reversed.
 */
function applyDirection(
  progress: number,
  iterationIndex: number,
  direction: GradientAngleTrack["direction"],
): number {
  switch (direction) {
    case "reverse":
      return 1 - progress;
    case "alternate":
      return iterationIndex % 2 === 1 ? 1 - progress : progress;
    case "alternate-reverse":
      return iterationIndex % 2 === 1 ? progress : 1 - progress;
    default:
      return progress;
  }
}

/**
 * Start a per-frame driver that interpolates `track` and pushes the angle to the
 * native gradient applier for `tag`. Returns a cleanup function that cancels the
 * RAF loop and clears the native override.
 *
 * No-op on web (the browser animates the gradient via `@property`/keyframes) and
 * gracefully no-op when the JSI channel is absent (engine not installed).
 */
export function startGradientAngleDriver(
  tag: number,
  track: GradientAngleTrack,
): () => void {
  // Web paints via CSS; nothing to drive. Also bail without a valid tag or
  // without the native channel installed.
  // RN macOS 0.81's requestAnimationFrame is backed by an ObjC Timing
  // TurboModule that can throw during rapid frame scheduling; that release's
  // exception conversion then corrupts Hermes. Keep the static native
  // gradient until Phase 4 installs a CAAnimation-backed macOS angle driver.
  if (
    Platform.OS === "web" ||
    Platform.OS === "macos" ||
    typeof tag !== "number" ||
    Number.isNaN(tag)
  ) {
    return () => {};
  }
  const setAngle = globalThis.__nitrocssSetGradientAngle;
  if (typeof setAngle !== "function") return () => {};

  const keyframes = [...(track.keyframes ?? [])].sort((a, b) => a.at - b.at);
  const easing = resolveEasing(track.easing);
  const duration = track.durationMs > 0 ? track.durationMs : 0;
  const delay = track.delayMs > 0 ? track.delayMs : 0;
  const iterations = track.iterations; // -1 == infinite
  const direction = track.direction ?? "normal";

  let rafId: number | null = null;
  let cancelled = false;
  const start =
    typeof globalThis.performance?.now === "function"
      ? globalThis.performance.now()
      : Date.now();

  const emit = (angle: number): void => {
    const fn = globalThis.__nitrocssSetGradientAngle;
    if (typeof fn === "function") fn(tag, angle);
  };

  // Degenerate duration: hold the final keyframe angle and never loop.
  if (duration === 0) {
    emit(angleAt(keyframes, applyDirection(1, 0, direction)));
    return () => {
      if (cancelled) return;
      cancelled = true;
      globalThis.__nitrocssClearGradientAngle?.(tag);
    };
  }

  const frame = (now: number): void => {
    if (cancelled) return;
    const elapsed = now - start - delay;
    if (elapsed < 0) {
      // Still within the delay window — hold the first frame's angle.
      emit(angleAt(keyframes, applyDirection(0, 0, direction)));
      rafId = requestAnimationFrame(frame);
      return;
    }
    const iterationIndex = Math.floor(elapsed / duration);
    const finished = iterations >= 0 && iterationIndex >= iterations;
    if (finished) {
      // Settle on the final iteration's end angle and stop looping.
      const lastIterationIndex = Math.max(0, iterations - 1);
      emit(angleAt(keyframes, applyDirection(1, lastIterationIndex, direction)));
      return;
    }
    const linear = (elapsed % duration) / duration;
    const eased = easing(linear);
    const directed = applyDirection(eased, iterationIndex, direction);
    emit(angleAt(keyframes, directed));
    rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);

  return () => {
    if (cancelled) return;
    cancelled = true;
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
    globalThis.__nitrocssClearGradientAngle?.(tag);
  };
}
