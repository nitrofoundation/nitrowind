import type { ComponentType, Ref } from "react";
import type { StyleProp } from "react-native";
import type { PseudoStateProp } from "../components/pseudo";
import {
  withNitroCss,
  type NitroCssPropMapping,
  type WithNitroCssOptions,
  type WithNitroCssProps,
} from "./withNitroCss";

/**
 * NativeWind-style shorthand mapping: `sourceClassNameProp → targetProp`,
 * e.g. `{ className: "style", contentContainerClassName: "contentContainerStyle" }`.
 * Style-ish targets (`style` / `*Style`) receive the resolved style object
 * (merged before any user-supplied value); any other target receives the
 * resolved style object as a plain prop.
 */
export type CssInteropShorthandMapping = Record<string, string>;

export type CssInteropMapping<P> =
  | WithNitroCssOptions<P>
  | CssInteropShorthandMapping;

const isShorthandMapping = <P,>(
  mapping: CssInteropMapping<P>,
): mapping is CssInteropShorthandMapping => {
  const values = Object.values(mapping);
  return values.length > 0 && values.every((value) => typeof value === "string");
};

/** Normalize a shorthand mapping to `withNitroCss` options (exported for tests). */
export function normalizeCssInteropMapping<P>(
  mapping?: CssInteropMapping<P>,
): WithNitroCssOptions<P> | undefined {
  if (!mapping) return undefined;
  if (!isShorthandMapping(mapping)) return mapping;
  const props: Record<string, NitroCssPropMapping> = {};
  for (const [sourceProp, targetProp] of Object.entries(mapping)) {
    // `className → style` is the wrapper's built-in behavior; declaring it
    // again would merge the same resolved style twice.
    if (sourceProp === "className" && targetProp === "style") continue;
    props[targetProp] = { fromClassName: sourceProp };
  }
  return props as WithNitroCssOptions<P>;
}

export type CssInteropComponent<P> = ComponentType<
  P & WithNitroCssProps & PseudoStateProp & { ref?: Ref<unknown> }
>;

/**
 * Teach any component to understand `className` (NativeWind-familiar API).
 * Thin ergonomic wrapper over {@link withNitroCss}.
 *
 * ```tsx
 * const StyledIcon = cssInterop(Icon);
 * const StyledSheet = cssInterop(BottomSheet, {
 *   handleClassName: "handleStyle", // shorthand: source → target
 * });
 * const StyledPath = cssInterop(Path, {
 *   props: { fill: { fromClassName: "className", styleProperty: "fill" } },
 * });
 * ```
 *
 * @param Component component to wrap (must tolerate a `style` prop for the
 *   default `className → style` behavior).
 * @param mapping optional prop mapping — either the NativeWind-style
 *   shorthand (`{ sourceClassNameProp: "targetProp" }`) or the full
 *   {@link WithNitroCssOptions} form.
 * @param componentName debug/native-registry name (defaults to the
 *   component's `displayName`/`name`).
 */
export function cssInterop<P extends object>(
  Component: ComponentType<P>,
  mapping?: CssInteropMapping<P>,
  componentName?: string,
): CssInteropComponent<P> {
  return withNitroCss(
    Component as ComponentType<P & { style?: StyleProp<unknown> }>,
    componentName ?? Component.displayName ?? Component.name ?? "Component",
    normalizeCssInteropMapping(mapping),
  ) as CssInteropComponent<P>;
}
