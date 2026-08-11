import {
  evaluateCssMath,
  isCssMathDescriptor,
  type CssMathDescriptor,
  type CssMathNode,
  type CssMathRuntime,
} from "./cssMath";

export interface CssMathRuntimeSnapshot {
  screen: { width: number; height: number };
  rem: number;
  fontScale?: number;
}

export interface CssMathLoweringContext {
  snapshot: CssMathRuntimeSnapshot;
  container?: {
    width: number;
    height: number;
    inlineSize?: number;
    blockSize?: number;
  };
  variables?: Readonly<Record<string, string | number | CssMathNode>>;
  /** Current computed font size. Defaults to `rem * fontScale`. */
  em?: number;
  /** Return the percentage base for a destination React Native property. */
  percentBase?: number | ((property: string) => number | undefined);
  unresolved?: "preserve" | "omit" | "throw";
}

function runtimeForProperty(
  property: string,
  context: CssMathLoweringContext,
): CssMathRuntime {
  const { snapshot, container } = context;
  return {
    viewportWidth: snapshot.screen.width,
    viewportHeight: snapshot.screen.height,
    containerWidth: container?.width,
    containerHeight: container?.height,
    containerInlineSize: container?.inlineSize ?? container?.width,
    containerBlockSize: container?.blockSize ?? container?.height,
    percentBase:
      typeof context.percentBase === "function"
        ? context.percentBase(property)
        : context.percentBase,
    rem: snapshot.rem,
    em: context.em ?? snapshot.rem * (snapshot.fontScale ?? 1),
    variables: context.variables,
  };
}

/** Lower one CSS math value using a stable native runtime snapshot. */
export function lowerCssMathValue(
  value: unknown,
  property: string,
  context: CssMathLoweringContext,
): unknown {
  if (!isCssMathDescriptor(value)) return value;
  const resolved = evaluateCssMath(value, runtimeForProperty(property, context));
  if (resolved !== undefined) return resolved;
  if (context.unresolved === "throw") {
    throw new Error(`Unable to resolve CSS math for ${property}`);
  }
  return context.unresolved === "omit" ? undefined : value;
}

/**
 * Copy-on-write lowering for a flat style. Unchanged styles preserve identity,
 * which lets the runtime keep static-resolution cache hits.
 */
export function lowerCssMathStyle<T extends Readonly<Record<string, unknown>>>(
  style: T,
  context: CssMathLoweringContext,
): T | Record<string, unknown> {
  let output: Record<string, unknown> | undefined;
  for (const [property, value] of Object.entries(style)) {
    if (!isCssMathDescriptor(value)) continue;
    const lowered = lowerCssMathValue(value, property, context);
    if (lowered === value) continue;
    output ??= { ...style };
    if (lowered === undefined) delete output[property];
    else output[property] = lowered;
  }
  return output ?? style;
}

/** Collect descriptors without resolving them, used by diagnostics overlays. */
export function cssMathEntries(
  style: Readonly<Record<string, unknown>>,
): Array<readonly [property: string, descriptor: CssMathDescriptor]> {
  return Object.entries(style).filter(
    (entry): entry is [string, CssMathDescriptor] =>
      isCssMathDescriptor(entry[1]),
  );
}
