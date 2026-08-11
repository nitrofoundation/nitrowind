import {
  isSemanticColorDescriptor,
  type DynamicSemanticColor,
  type PlatformSemanticColor,
  type SemanticColorDescriptor,
  type SemanticColorValue,
} from "./semanticColors";
import {
  serializeWideGamutColor,
  type WideGamutColorDescriptor,
} from "./tailwindV4";

export interface DynamicColorOptions<T> {
  light: T;
  dark: T;
  highContrastLight?: T;
  highContrastDark?: T;
}

export interface NativeColorAdapter<T = unknown> {
  platformColor(name: string): T | undefined;
  dynamicColor?(options: DynamicColorOptions<T>): T;
  wideGamutColor?(descriptor: WideGamutColorDescriptor): T;
}

export interface ColorLoweringContext<T = unknown> {
  scheme: "light" | "dark";
  highContrast?: boolean;
  adapter: NativeColorAdapter<T>;
  /** Preserve descriptors by default so the native layer can resolve them. */
  unresolved?: "preserve" | "fallback" | "throw";
}

export const isWideGamutColorDescriptor = (
  value: unknown,
): value is WideGamutColorDescriptor =>
  typeof value === "object" &&
  value !== null &&
  ((value as { $wideGamutColor?: unknown }).$wideGamutColor === "display-p3" ||
    (value as { $wideGamutColor?: unknown }).$wideGamutColor === "oklch");

function srgbTransfer(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function linearize(value: number): number {
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

/** Convert a wide-gamut descriptor to a deterministic clipped sRGB fallback. */
export function wideGamutToSrgb(
  color: WideGamutColorDescriptor,
): readonly [red: number, green: number, blue: number, alpha: number] {
  let red: number;
  let green: number;
  let blue: number;
  if (color.$wideGamutColor === "display-p3") {
    const p3r = linearize(color.channels[0]);
    const p3g = linearize(color.channels[1]);
    const p3b = linearize(color.channels[2]);
    red = 1.22474527 * p3r - 0.22490437 * p3g;
    green = -0.0420571 * p3r + 1.042081 * p3g;
    blue = -0.01964228 * p3r - 0.07865492 * p3g + 1.0985372 * p3b;
  } else {
    const angle = (color.hue * Math.PI) / 180;
    const a = color.chroma * Math.cos(angle);
    const b = color.chroma * Math.sin(angle);
    const lRoot = color.lightness + 0.39633778 * a + 0.21580376 * b;
    const mRoot = color.lightness - 0.10556135 * a - 0.06385417 * b;
    const sRoot = color.lightness - 0.08948418 * a - 1.29148555 * b;
    const l = lRoot ** 3;
    const m = mRoot ** 3;
    const s = sRoot ** 3;
    red = 4.07674166 * l - 3.30771159 * m + 0.23096993 * s;
    green = -1.268438 * l + 2.6097574 * m - 0.3413194 * s;
    blue = -0.00419609 * l - 0.70341861 * m + 1.7076147 * s;
  }
  return [
    srgbTransfer(red),
    srgbTransfer(green),
    srgbTransfer(blue),
    color.alpha,
  ];
}

function rgbaFallback(color: WideGamutColorDescriptor): string {
  const [red, green, blue, alpha] = wideGamutToSrgb(color);
  const channel = (value: number): number => Math.round(value * 255);
  return `rgba(${channel(red)}, ${channel(green)}, ${channel(blue)}, ${Number(alpha.toFixed(4))})`;
}

function lowerPlatform<T>(
  color: PlatformSemanticColor,
  context: ColorLoweringContext<T>,
): T | string | PlatformSemanticColor {
  const resolved = context.adapter.platformColor(color.name);
  if (resolved !== undefined) return resolved;
  if (color.fallback !== undefined) return color.fallback;
  if (context.unresolved === "throw") {
    throw new Error(`Native platform color is unavailable: ${color.name}`);
  }
  return color;
}

function selectedDynamicValue(
  color: DynamicSemanticColor,
  context: ColorLoweringContext,
): SemanticColorValue {
  if (context.highContrast) {
    return context.scheme === "dark"
      ? color.highContrastDark ?? color.dark
      : color.highContrastLight ?? color.light;
  }
  return context.scheme === "dark" ? color.dark : color.light;
}

function lowerSemanticValue<T>(
  value: SemanticColorValue,
  context: ColorLoweringContext<T>,
): T | string | PlatformSemanticColor {
  return typeof value === "string" ? value : lowerPlatform(value, context);
}

function lowerDynamic<T>(
  color: DynamicSemanticColor,
  context: ColorLoweringContext<T>,
): unknown {
  if (!context.adapter.dynamicColor) {
    return lowerSemanticValue(
      selectedDynamicValue(color, context as ColorLoweringContext),
      context,
    );
  }
  const light = lowerSemanticValue(color.light, context);
  const dark = lowerSemanticValue(color.dark, context);
  const unresolvedLight =
    typeof color.light !== "string" && light === color.light;
  const unresolvedDark = typeof color.dark !== "string" && dark === color.dark;
  if (unresolvedLight || unresolvedDark) {
    return context.unresolved === "fallback"
      ? lowerSemanticValue(
          selectedDynamicValue(color, context as ColorLoweringContext),
          context,
        )
      : color;
  }
  const highContrastLight = color.highContrastLight
    ? lowerSemanticValue(color.highContrastLight, context)
    : undefined;
  const highContrastDark = color.highContrastDark
    ? lowerSemanticValue(color.highContrastDark, context)
    : undefined;
  return context.adapter.dynamicColor({
    light: light as T,
    dark: dark as T,
    ...(highContrastLight === undefined
      ? {}
      : { highContrastLight: highContrastLight as T }),
    ...(highContrastDark === undefined
      ? {}
      : { highContrastDark: highContrastDark as T }),
  });
}

/** Lower semantic and wide-gamut descriptors through a platform adapter. */
export function lowerNativeColor<T>(
  value: unknown,
  context: ColorLoweringContext<T>,
): unknown {
  if (isSemanticColorDescriptor(value)) {
    return value.$semanticColor === "platform"
      ? lowerPlatform(value, context)
      : lowerDynamic(value, context);
  }
  if (!isWideGamutColorDescriptor(value)) return value;
  if (context.adapter.wideGamutColor) {
    return context.adapter.wideGamutColor(value);
  }
  if (context.unresolved === "preserve" || context.unresolved === undefined) {
    return value;
  }
  if (context.unresolved === "throw") {
    throw new Error(`Native wide-gamut color is unavailable: ${serializeWideGamutColor(value)}`);
  }
  return rgbaFallback(value);
}

/** Copy-on-write lowering for every color descriptor in a flat native style. */
export function lowerNativeColorStyle<T extends Readonly<Record<string, unknown>>>(
  style: T,
  context: ColorLoweringContext,
): T | Record<string, unknown> {
  let output: Record<string, unknown> | undefined;
  for (const [property, value] of Object.entries(style)) {
    if (!isSemanticColorDescriptor(value) && !isWideGamutColorDescriptor(value)) {
      continue;
    }
    const lowered = lowerNativeColor(value, context);
    if (lowered === value) continue;
    output ??= { ...style };
    output[property] = lowered;
  }
  return output ?? style;
}

export type { SemanticColorDescriptor, WideGamutColorDescriptor };
