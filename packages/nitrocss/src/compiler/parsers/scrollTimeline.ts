import type { Keyframes, RNStyle } from "../types";

export const SCROLL_TIMELINE_SOURCE_PROP = "--nitrocss-scroll-timeline-source";
export const SCROLL_TIMELINE_ANIMATION_PROP = "--nitrocss-scroll-timeline-animation";

type Decl = { prop: string; value: string };

export interface ScrollTimelineSourceDescriptor {
  name: string;
  axis: "block" | "inline" | "x" | "y";
}

export interface ScrollTimelineAnimationDescriptor {
  timeline: string;
  rangeStart: number;
  rangeEnd: number;
  keyframes: Keyframes;
  kind?: "scroll" | "view";
  axis?: "block" | "inline" | "x" | "y";
  rangeStartPhase?: ViewTimelinePhase;
  rangeEndPhase?: ViewTimelinePhase;
}

export type ViewTimelinePhase = "cover" | "entry" | "contain" | "exit";

export const isScrollTimelineProp = (prop: string): boolean =>
  prop === "scroll-timeline" ||
  prop === "scroll-timeline-name" ||
  prop === "scroll-timeline-axis" ||
  prop === "animation-timeline" ||
  prop === "animation-range" ||
  prop === "animation-range-start" ||
  prop === "animation-range-end";

const declaration = (declarations: readonly Decl[], prop: string): string | undefined =>
  declarations.find((item) => item.prop === prop)?.value.trim();

const rangeOffset = (value: string | undefined, fallback: number): number => {
  if (!value || value === "normal") return fallback;
  const match = /^(-?\d*\.?\d+)%$/.exec(value.trim());
  if (!match) return fallback;
  return Number.parseFloat(match[1]!) / 100;
};

const VIEW_PHASES = new Set<ViewTimelinePhase>(["cover", "entry", "contain", "exit"]);

const rangeBoundary = (
  value: string | undefined,
  fallbackOffset: number,
): { phase: ViewTimelinePhase; offset: number } => {
  const tokens = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  const phase = VIEW_PHASES.has(tokens[0] as ViewTimelinePhase)
    ? tokens.shift() as ViewTimelinePhase
    : "cover";
  return { phase, offset: rangeOffset(tokens[0], fallbackOffset) };
};

const viewRange = (
  declarations: readonly Decl[],
): Pick<ScrollTimelineAnimationDescriptor, "rangeStart" | "rangeEnd" | "rangeStartPhase" | "rangeEndPhase"> => {
  const shorthand = declaration(declarations, "animation-range")?.trim().split(/\s+/).filter(Boolean) ?? [];
  const named = shorthand.some((token) => VIEW_PHASES.has(token as ViewTimelinePhase));
  let shorthandStart: string | undefined;
  let shorthandEnd: string | undefined;
  if (named) {
    const boundaryStarts = shorthand
      .map((token, index) => VIEW_PHASES.has(token as ViewTimelinePhase) ? index : -1)
      .filter((index) => index >= 0);
    if (boundaryStarts.length === 1) {
      // CSS optimizers collapse `entry 0% entry 100%` to `entry`. A single
      // named range spans that phase, rather than starting at `entry` and
      // implicitly ending at `cover`.
      shorthandStart = shorthand.join(" ");
      shorthandEnd = `${shorthand[boundaryStarts[0]!]} 100%`;
    } else {
      const split = boundaryStarts[1] ?? shorthand.length;
      shorthandStart = shorthand.slice(0, split).join(" ");
      shorthandEnd = shorthand.slice(split).join(" ") || undefined;
    }
  } else {
    shorthandStart = shorthand[0];
    shorthandEnd = shorthand[1];
  }
  const start = rangeBoundary(
    declaration(declarations, "animation-range-start") ?? shorthandStart,
    0,
  );
  const end = rangeBoundary(
    declaration(declarations, "animation-range-end") ?? shorthandEnd,
    1,
  );
  return {
    rangeStart: start.offset,
    rangeEnd: end.offset,
    rangeStartPhase: start.phase,
    rangeEndPhase: end.phase,
  };
};

export function extractScrollTimelineSource(
  declarations: readonly Decl[],
): ScrollTimelineSourceDescriptor | undefined {
  const shorthand = declaration(declarations, "scroll-timeline")?.split(/\s+/);
  const name = declaration(declarations, "scroll-timeline-name") ?? shorthand?.[0];
  const rawAxis = declaration(declarations, "scroll-timeline-axis") ?? shorthand?.[1] ?? "block";
  if (!name?.startsWith("--") || !["block", "inline", "x", "y"].includes(rawAxis)) {
    return undefined;
  }
  return { name, axis: rawAxis as ScrollTimelineSourceDescriptor["axis"] };
}

export function extractScrollTimelineAnimation(
  declarations: readonly Decl[],
  animationStyle: RNStyle | undefined,
): ScrollTimelineAnimationDescriptor | undefined {
  const rawTimeline = declaration(declarations, "animation-timeline");
  const keyframes = animationStyle?.animationName;
  const viewMatch = /^view\(\s*(?:(block|inline|x|y)\s*)?\)$/i.exec(rawTimeline ?? "");
  const isViewTimeline = viewMatch !== null;
  if ((!rawTimeline?.startsWith("--") && !isViewTimeline) || !keyframes || typeof keyframes !== "object" || Array.isArray(keyframes)) {
    return undefined;
  }

  if (isViewTimeline) {
    return {
      timeline: "",
      kind: "view",
      axis: (viewMatch[1]?.toLowerCase() ?? "block") as ScrollTimelineAnimationDescriptor["axis"],
      ...viewRange(declarations),
      keyframes: keyframes as Keyframes,
    };
  }

  const shorthand = declaration(declarations, "animation-range")?.split(/\s+/);
  const rangeStart = rangeOffset(
    declaration(declarations, "animation-range-start") ?? shorthand?.[0],
    0,
  );
  const rangeEnd = rangeOffset(
    declaration(declarations, "animation-range-end") ?? shorthand?.[1],
    1,
  );
  return {
    timeline: rawTimeline!,
    rangeStart: Math.min(rangeStart, rangeEnd),
    rangeEnd: Math.max(rangeStart, rangeEnd),
    keyframes: keyframes as Keyframes,
  };
}
