export type SemanticColorScheme = "light" | "dark";

export interface PlatformSemanticColor {
  $semanticColor: "platform";
  name: string;
  fallback?: string;
}

export interface DynamicSemanticColor {
  $semanticColor: "dynamic";
  light: SemanticColorValue;
  dark: SemanticColorValue;
  highContrastLight?: SemanticColorValue;
  highContrastDark?: SemanticColorValue;
}

export type SemanticColorValue = string | PlatformSemanticColor;
export type SemanticColorDescriptor = PlatformSemanticColor | DynamicSemanticColor;

export interface SemanticColorRuntime {
  scheme: SemanticColorScheme;
  highContrast?: boolean;
  resolvePlatformColor?: (name: string) => string | undefined;
}

/** Cross-platform aliases. The native adapter may map these to richer platform colors. */
export const SEMANTIC_COLOR_TOKENS = {
  label: { ios: "labelColor", android: "?android:attr/textColorPrimary" },
  secondaryLabel: { ios: "secondaryLabelColor", android: "?android:attr/textColorSecondary" },
  systemBackground: { ios: "systemBackgroundColor", android: "?android:attr/colorBackground" },
  secondarySystemBackground: {
    ios: "secondarySystemBackgroundColor",
    android: "?android:attr/colorBackgroundFloating",
  },
  separator: { ios: "separatorColor", android: "?android:attr/listDivider" },
  link: { ios: "linkColor", android: "?android:attr/textColorLink" },
  accent: { ios: "systemBlueColor", android: "?android:attr/colorAccent" },
} as const;

export type SemanticColorToken = keyof typeof SEMANTIC_COLOR_TOKENS;

const PLATFORM_NAME = /^(?:\?[a-zA-Z][\w:.?/-]*|[a-zA-Z][\w.-]*)$/;

function splitArguments(source: string): string[] | undefined {
  const result: string[] = [];
  let start = 0;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth < 0) return undefined;
    } else if (char === "," && depth === 0) {
      result.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (depth !== 0) return undefined;
  result.push(source.slice(start).trim());
  return result.every(Boolean) ? result : undefined;
}

export function platformSemanticColor(
  name: string,
  fallback?: string,
): PlatformSemanticColor | undefined {
  const normalized = name.trim();
  if (!PLATFORM_NAME.test(normalized)) return undefined;
  return fallback === undefined
    ? { $semanticColor: "platform", name: normalized }
    : { $semanticColor: "platform", name: normalized, fallback: fallback.trim() };
}

function parseValue(value: string): SemanticColorValue | undefined {
  const platform = parseSemanticColor(value);
  if (platform?.$semanticColor === "platform") return platform;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

/** Parse `platform-color()` and `dynamic-color()` into JSON-safe native descriptors. */
export function parseSemanticColor(value: string): SemanticColorDescriptor | undefined {
  const normalized = value.trim();
  const platform = /^platform-color\((.*)\)$/is.exec(normalized);
  if (platform) {
    const args = splitArguments(platform[1]!);
    if (!args || args.length < 1 || args.length > 2) return undefined;
    return platformSemanticColor(args[0]!, args[1]);
  }
  const dynamic = /^dynamic-color\((.*)\)$/is.exec(normalized);
  if (!dynamic) return undefined;
  const args = splitArguments(dynamic[1]!);
  if (!args || (args.length !== 2 && args.length !== 4)) return undefined;
  const colors = args.map(parseValue);
  if (colors.some((color) => color === undefined)) return undefined;
  const result: DynamicSemanticColor = {
    $semanticColor: "dynamic",
    light: colors[0]!,
    dark: colors[1]!,
  };
  if (args.length === 4) {
    result.highContrastLight = colors[2]!;
    result.highContrastDark = colors[3]!;
  }
  return result;
}

/** Produce a native descriptor for a cross-platform semantic token. */
export function semanticColorToken(
  token: SemanticColorToken,
  platform: "ios" | "android",
  fallback?: string,
): PlatformSemanticColor {
  return {
    $semanticColor: "platform",
    name: SEMANTIC_COLOR_TOKENS[token][platform],
    ...(fallback === undefined ? {} : { fallback }),
  };
}

function resolveValue(
  value: SemanticColorValue,
  runtime: SemanticColorRuntime,
): string | undefined {
  return typeof value === "string" ? value : resolveSemanticColor(value, runtime);
}

/** JS fallback resolver. Native integrations should preserve the descriptor until paint time. */
export function resolveSemanticColor(
  descriptor: SemanticColorDescriptor,
  runtime: SemanticColorRuntime,
): string | undefined {
  if (descriptor.$semanticColor === "platform") {
    return runtime.resolvePlatformColor?.(descriptor.name) ?? descriptor.fallback;
  }
  const selected = runtime.highContrast
    ? runtime.scheme === "dark"
      ? descriptor.highContrastDark ?? descriptor.dark
      : descriptor.highContrastLight ?? descriptor.light
    : runtime.scheme === "dark"
      ? descriptor.dark
      : descriptor.light;
  return resolveValue(selected, runtime);
}

export function serializeSemanticColor(descriptor: SemanticColorDescriptor): string {
  if (descriptor.$semanticColor === "platform") {
    return `platform-color(${descriptor.name}${descriptor.fallback ? `, ${descriptor.fallback}` : ""})`;
  }
  const serialize = (value: SemanticColorValue): string =>
    typeof value === "string" ? value : serializeSemanticColor(value);
  const values = [serialize(descriptor.light), serialize(descriptor.dark)];
  if (descriptor.highContrastLight && descriptor.highContrastDark) {
    values.push(serialize(descriptor.highContrastLight), serialize(descriptor.highContrastDark));
  }
  return `dynamic-color(${values.join(", ")})`;
}

export const isSemanticColorDescriptor = (value: unknown): value is SemanticColorDescriptor =>
  typeof value === "object" &&
  value !== null &&
  ((value as { $semanticColor?: unknown }).$semanticColor === "platform" ||
    (value as { $semanticColor?: unknown }).$semanticColor === "dynamic");
