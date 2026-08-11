import { converter, formatHex, formatHex8, parse } from "culori";

type MixSpace = "oklab" | "rgb" | "lrgb";

const splitTopLevel = (value: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
};

const parseStop = (raw: string) => {
  const match = /^(.*\S)\s+([+-]?(?:\d*\.)?\d+)%$/.exec(raw.trim());
  return {
    color: parse(match?.[1] ?? raw.trim()),
    weight: match ? Math.max(0, Number(match[2]) / 100) : undefined,
  };
};

/** Lower Tailwind's CSS Color 5 subset after live theme vars resolve. */
export function resolveColorMix(value: string): string | undefined {
  const match = /^color-mix\((.*)\)$/is.exec(value.trim());
  if (!match) return undefined;
  const parts = splitTopLevel(match[1]!);
  if (parts.length !== 3) return undefined;
  const requested = /^in\s+(oklab|srgb|srgb-linear)$/i.exec(parts[0]!)?.[1];
  if (!requested) return undefined;
  const space: MixSpace =
    requested.toLowerCase() === "srgb-linear"
      ? "lrgb"
      : requested.toLowerCase() === "srgb"
        ? "rgb"
        : "oklab";
  const first = parseStop(parts[1]!);
  const second = parseStop(parts[2]!);
  if (!first.color || !second.color) return undefined;
  let w1 = first.weight ?? (second.weight === undefined ? 0.5 : 1 - second.weight);
  let w2 = second.weight ?? (first.weight === undefined ? 0.5 : 1 - first.weight);
  const sum = w1 + w2;
  if (sum <= 0) return undefined;
  const alphaMultiplier = Math.min(1, sum);
  w1 /= sum;
  w2 /= sum;

  const convert = converter(space);
  const a = convert(first.color) as unknown as Record<string, number | string>;
  const b = convert(second.color) as unknown as Record<string, number | string>;
  const keys = space === "oklab" ? (["l", "a", "b"] as const) : (["r", "g", "b"] as const);
  const alphaA = typeof a.alpha === "number" ? a.alpha : 1;
  const alphaB = typeof b.alpha === "number" ? b.alpha : 1;
  const alpha = alphaA * w1 + alphaB * w2;
  const divisor = alpha || 1;
  const channels = keys.map(
    (key) =>
      (((a[key] as number) || 0) * alphaA * w1 +
        ((b[key] as number) || 0) * alphaB * w2) /
      divisor,
  );
  const mixedAlpha = alpha * alphaMultiplier;
  const mixed = {
    mode: space,
    [keys[0]]: channels[0],
    [keys[1]]: channels[1],
    [keys[2]]: channels[2],
    alpha: mixedAlpha,
  } as unknown as Parameters<typeof formatHex>[0];
  return mixedAlpha < 1
    ? formatHex8(mixed)
    : formatHex(mixed);
}
