import { Platform } from "react-native";

export interface MaskTransformKeyframe {
  at: number;
  angle: number;
  scale: number;
}

export interface MaskTransformTrack {
  durationMs: number;
  delayMs: number;
  iterations: number;
  direction: "normal" | "reverse" | "alternate" | "alternate-reverse";
  easing: string;
  keyframes: MaskTransformKeyframe[];
}

declare global {
  // eslint-disable-next-line no-var
  var __nitrocssSetMaskTransform:
    | ((tag: number, angle: number, scale: number) => void)
    | undefined;
  // eslint-disable-next-line no-var
  var __nitrocssClearMaskTransform: ((tag: number) => void) | undefined;
}

type EasingFn = (t: number) => number;
const EASINGS: Record<string, EasingFn> = {
  linear: (t) => t,
  ease: (t) => t * t * (3 - 2 * t),
  "ease-in": (t) => t * t,
  "ease-out": (t) => t * (2 - t),
  "ease-in-out": (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
};

function directedProgress(
  progress: number,
  iteration: number,
  direction: MaskTransformTrack["direction"],
): number {
  if (direction === "reverse") return 1 - progress;
  if (direction === "alternate") return iteration % 2 ? 1 - progress : progress;
  if (direction === "alternate-reverse") return iteration % 2 ? progress : 1 - progress;
  return progress;
}

function valuesAt(
  keyframes: MaskTransformKeyframe[],
  progress: number,
): { angle: number; scale: number } {
  if (keyframes.length === 0) return { angle: 0, scale: 1 };
  if (progress <= keyframes[0]!.at) return keyframes[0]!;
  const last = keyframes[keyframes.length - 1]!;
  if (progress >= last.at) return last;
  for (let i = 1; i < keyframes.length; i++) {
    const next = keyframes[i]!;
    if (progress <= next.at) {
      const previous = keyframes[i - 1]!;
      const span = next.at - previous.at;
      const local = span > 0 ? (progress - previous.at) / span : 1;
      return {
        angle: previous.angle + (next.angle - previous.angle) * local,
        scale: previous.scale + (next.scale - previous.scale) * local,
      };
    }
  }
  return last;
}

/** Drive only the native mask layer's geometry; the masked host never moves. */
export function startMaskTransformDriver(
  tag: number,
  track: MaskTransformTrack,
): () => void {
  if (Platform.OS === "web" || typeof tag !== "number" || Number.isNaN(tag)) {
    return () => {};
  }
  if (typeof globalThis.__nitrocssSetMaskTransform !== "function") return () => {};

  const keyframes = [...track.keyframes].sort((a, b) => a.at - b.at);
  const easing = EASINGS[track.easing?.trim().toLowerCase()] ?? EASINGS.linear!;
  const duration = Math.max(0, track.durationMs);
  const delay = Math.max(0, track.delayMs);
  const direction = track.direction ?? "normal";
  let rafId: number | null = null;
  let cancelled = false;
  const started = globalThis.performance?.now?.() ?? Date.now();

  const emit = (progress: number, iteration: number): void => {
    const values = valuesAt(keyframes, directedProgress(progress, iteration, direction));
    globalThis.__nitrocssSetMaskTransform?.(tag, values.angle, values.scale);
  };

  if (duration === 0) {
    emit(1, 0);
    return () => globalThis.__nitrocssClearMaskTransform?.(tag);
  }

  const frame = (now: number): void => {
    if (cancelled) return;
    const elapsed = now - started - delay;
    if (elapsed < 0) {
      emit(0, 0);
      rafId = requestAnimationFrame(frame);
      return;
    }
    const iteration = Math.floor(elapsed / duration);
    if (track.iterations >= 0 && iteration >= track.iterations) {
      emit(1, Math.max(0, track.iterations - 1));
      return;
    }
    emit(easing((elapsed % duration) / duration), iteration);
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);

  return () => {
    if (cancelled) return;
    cancelled = true;
    if (rafId != null) cancelAnimationFrame(rafId);
    globalThis.__nitrocssClearMaskTransform?.(tag);
  };
}
