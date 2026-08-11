export type TailwindV4TransformPrimitive =
  | { kind: "perspective"; value: number | string }
  | { kind: "perspective-origin"; x: string | number; y: string | number }
  | {
      kind: "transform-origin";
      x: string | number;
      y: string | number;
      z?: number | string;
    }
  | { kind: "transform-style"; value: "flat" | "preserve-3d" }
  | { kind: "backface-visibility"; value: "visible" | "hidden" }
  | { kind: "translate-z"; value: number | string }
  | { kind: "rotate-x" | "rotate-y" | "rotate-z"; value: string };

export type TailwindV4Variant =
  | { kind: "not"; selector: string }
  | { kind: "starting-style" }
  | { kind: "data" | "aria"; attribute: string; value?: string }
  | { kind: "arbitrary-state"; selector: string };

export type WideGamutColorDescriptor =
  | {
      $wideGamutColor: "display-p3";
      channels: readonly [number, number, number];
      alpha: number;
    }
  | {
      $wideGamutColor: "oklch";
      lightness: number;
      chroma: number;
      hue: number;
      alpha: number;
    };

export interface TailwindV4Candidate {
  variants: TailwindV4Variant[];
  utility: string;
  important: boolean;
}

const LENGTH_SCALE: Readonly<Record<string, number>> = {
  px: 1,
  0: 0,
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  24: 96,
};

const PERSPECTIVE_SCALE: Readonly<Record<string, number | string>> = {
  none: "none",
  dramatic: 100,
  near: 300,
  normal: 500,
  midrange: 800,
  distant: 1200,
};

const ORIGINS: Readonly<Record<string, readonly [string, string]>> = {
  center: ["50%", "50%"],
  top: ["50%", "0%"],
  "top-right": ["100%", "0%"],
  right: ["100%", "50%"],
  "bottom-right": ["100%", "100%"],
  bottom: ["50%", "100%"],
  "bottom-left": ["0%", "100%"],
  left: ["0%", "50%"],
  "top-left": ["0%", "0%"],
};

function unwrapArbitrary(value: string): string | undefined {
  return value.startsWith("[") && value.endsWith("]")
    ? value.slice(1, -1).replaceAll("_", " ")
    : undefined;
}

function parseLength(value: string): number | string | undefined {
  const arbitrary = unwrapArbitrary(value);
  if (arbitrary !== undefined) return arbitrary;
  return LENGTH_SCALE[value];
}

function splitCandidate(candidate: string): string[] | undefined {
  const result: string[] = [];
  let start = 0;
  let square = 0;
  let round = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (char === "[") square += 1;
    else if (char === "]") square -= 1;
    else if (char === "(") round += 1;
    else if (char === ")") round -= 1;
    else if (char === ":" && square === 0 && round === 0) {
      result.push(candidate.slice(start, index));
      start = index + 1;
    }
    if (square < 0 || round < 0) return undefined;
  }
  if (square !== 0 || round !== 0) return undefined;
  result.push(candidate.slice(start));
  return result.every(Boolean) ? result : undefined;
}

export function parseTailwindV4Variant(
  raw: string,
): TailwindV4Variant | undefined {
  if (raw === "starting") return { kind: "starting-style" };
  if (raw.startsWith("not-") && raw.length > 4) {
    const selector = unwrapArbitrary(raw.slice(4)) ?? raw.slice(4);
    return { kind: "not", selector };
  }
  const attribute = /^(data|aria)-\[([a-zA-Z_][\w-]*)(?:=([^\]]+))?\]$/.exec(
    raw,
  );
  if (attribute) {
    return {
      kind: attribute[1] as "data" | "aria",
      attribute: attribute[2]!,
      ...(attribute[3] === undefined ? {} : { value: attribute[3] }),
    };
  }
  const arbitrary = unwrapArbitrary(raw);
  return arbitrary?.includes("&")
    ? { kind: "arbitrary-state", selector: arbitrary }
    : undefined;
}

/** Split a Tailwind candidate without breaking arbitrary values containing colons. */
export function parseTailwindV4Candidate(
  candidate: string,
): TailwindV4Candidate | undefined {
  const segments = splitCandidate(candidate.trim());
  if (!segments?.length) return undefined;
  let utility = segments.at(-1)!;
  const important = utility.endsWith("!");
  if (important) utility = utility.slice(0, -1);
  const variants: TailwindV4Variant[] = [];
  for (const raw of segments.slice(0, -1)) {
    const variant = parseTailwindV4Variant(raw);
    if (!variant) return undefined;
    variants.push(variant);
  }
  return utility ? { variants, utility, important } : undefined;
}

export function parseTailwindV4Transform(
  utility: string,
): TailwindV4TransformPrimitive | undefined {
  const negative = utility.startsWith("-");
  const candidate = negative ? utility.slice(1) : utility;
  if (utility === "transform-3d") {
    return { kind: "transform-style", value: "preserve-3d" };
  }
  if (utility === "transform-flat") return { kind: "transform-style", value: "flat" };
  if (utility === "backface-hidden") return { kind: "backface-visibility", value: "hidden" };
  if (utility === "backface-visible") return { kind: "backface-visibility", value: "visible" };
  if (utility.startsWith("perspective-origin-")) {
    const key = utility.slice("perspective-origin-".length);
    const origin = ORIGINS[key];
    if (!origin) return undefined;
    return { kind: "perspective-origin", x: origin[0], y: origin[1] };
  }
  if (utility.startsWith("origin-")) {
    const raw = utility.slice("origin-".length);
    const origin = ORIGINS[raw];
    if (origin) return { kind: "transform-origin", x: origin[0], y: origin[1] };
    const arbitrary = unwrapArbitrary(raw)?.trim().split(/\s+/);
    if (!arbitrary || arbitrary.length < 1 || arbitrary.length > 3) return undefined;
    return {
      kind: "transform-origin",
      x: arbitrary[0]!,
      y: arbitrary[1] ?? "50%",
      ...(arbitrary[2] === undefined ? {} : { z: arbitrary[2] }),
    };
  }
  if (utility.startsWith("perspective-")) {
    const key = utility.slice("perspective-".length);
    const arbitrary = unwrapArbitrary(key);
    const value = arbitrary ?? PERSPECTIVE_SCALE[key];
    return value === undefined ? undefined : { kind: "perspective", value };
  }
  if (candidate.startsWith("translate-z-")) {
    const value = parseLength(candidate.slice("translate-z-".length));
    if (value === undefined) return undefined;
    const signed = negative
      ? typeof value === "number"
        ? -value
        : `calc(${value} * -1)`
      : value;
    return { kind: "translate-z", value: signed };
  }
  const rotate = /^(rotate-[xyz])-(.+)$/.exec(candidate);
  if (rotate) {
    const raw = unwrapArbitrary(rotate[2]!) ?? `${rotate[2]}deg`;
    if (!/^-?(?:\d*\.)?\d+(?:deg|rad|grad|turn)$/.test(raw)) return undefined;
    const signed = negative && !raw.startsWith("-") ? `-${raw}` : raw;
    return { kind: rotate[1] as "rotate-x" | "rotate-y" | "rotate-z", value: signed };
  }
  return undefined;
}

function alphaPart(raw: string | undefined): number | undefined {
  if (raw === undefined) return 1;
  const percent = raw.endsWith("%");
  const value = Number(percent ? raw.slice(0, -1) : raw);
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, percent ? value / 100 : value));
}

/** Preserve P3/OKLCH values for native wide-gamut conversion instead of clipping to sRGB. */
export function parseWideGamutColor(value: string): WideGamutColorDescriptor | undefined {
  const p3 =
    /^color\(display-p3\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)\s+([+-]?[\d.]+)(?:\s*\/\s*([\d.]+%?))?\)$/i.exec(
      value.trim(),
    );
  if (p3) {
    const channels = [Number(p3[1]), Number(p3[2]), Number(p3[3])] as const;
    const alpha = alphaPart(p3[4]);
    if (
      channels.some((channel) => !Number.isFinite(channel)) ||
      alpha === undefined
    ) {
      return undefined;
    }
    return { $wideGamutColor: "display-p3", channels, alpha };
  }
  const oklch =
    /^oklch\(([\d.]+)(%)?\s+([\d.]+)\s+([+-]?[\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\)$/i.exec(
      value.trim(),
    );
  if (!oklch) return undefined;
  const lightness = Number(oklch[1]) / (oklch[2] ? 100 : 1);
  const chroma = Number(oklch[3]);
  const hue = ((Number(oklch[4]) % 360) + 360) % 360;
  const alpha = alphaPart(oklch[5]);
  if (![lightness, chroma, hue].every(Number.isFinite) || alpha === undefined) return undefined;
  return { $wideGamutColor: "oklch", lightness, chroma, hue, alpha };
}

export function serializeWideGamutColor(color: WideGamutColorDescriptor): string {
  if (color.$wideGamutColor === "display-p3") {
    return `color(display-p3 ${color.channels.join(" ")}${color.alpha < 1 ? ` / ${color.alpha}` : ""})`;
  }
  return `oklch(${color.lightness} ${color.chroma} ${color.hue}${color.alpha < 1 ? ` / ${color.alpha}` : ""})`;
}
