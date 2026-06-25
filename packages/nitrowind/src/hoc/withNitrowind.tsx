import React, {
  forwardRef,
  useCallback,
  useMemo,
  type ComponentType,
  type Ref,
} from "react";
import type { LayoutChangeEvent, StyleProp } from "react-native";
import { resolveStyles } from "../core/store";
import { getClassBuckets } from "../core/registry";
import type { RNStyle } from "../compiler/types";
import type { ComponentState, RuntimeSnapshot } from "../specs/types";
import { getAnimatedComponent, getAnimatedView } from "../components/animated";
import {
  ContainerProvider,
  useContainer,
} from "../components/containerContext";
import { useGridFallback } from "../components/grid";
import type { NativeAccentDescriptor } from "../components/internal";
import { useLinkedRef, useReactiveSnapshot } from "../components/internal";
import {
  type PseudoStateProp,
  withChildPseudoState,
  withComponentPseudoState,
} from "../components/pseudo";

export interface WithNitrowindProps {
  className?: string;
  style?: StyleProp<unknown>;
}

export interface NitrowindPropMapping {
  fromClassName: string;
  styleProperty?: keyof RNStyle;
  nativeProp?: string;
}

export type WithNitrowindPropOptions<P> = Partial<
  Record<keyof P & string, NitrowindPropMapping>
>;

export interface WithNitrowindAdvancedOptions<P> {
  props?: Partial<Record<keyof P & string, NitrowindPropMapping>>;
  nativeColorProps?: Record<string, string>;
}

export type WithNitrowindOptions<P> =
  | WithNitrowindPropOptions<P>
  | WithNitrowindAdvancedOptions<P>;

const isAdvancedOptions = <P,>(
  options: WithNitrowindOptions<P> | undefined,
): options is WithNitrowindAdvancedOptions<P> =>
  !!options && ("props" in options || "nativeColorProps" in options);

const propOptionsFor = <P,>(
  options: WithNitrowindOptions<P> | undefined,
): WithNitrowindPropOptions<P> | undefined => {
  if (!options) return undefined;
  return isAdvancedOptions(options) ? options.props : options;
};

const nativeColorPropsFor = <P,>(
  options: WithNitrowindOptions<P> | undefined,
): Record<string, string> =>
  isAdvancedOptions(options) ? (options.nativeColorProps ?? {}) : {};

const classToStyleProp = (propName: string): string =>
  propName === "className" ? "style" : propName.replace(/ClassName$/, "Style");

const classToColorProp = (propName: string): string =>
  propName.replace(/ClassName$/, "");

const isClassProp = (propName: string): boolean =>
  propName === "className" || propName.endsWith("ClassName");

const isColorClassProp = (propName: string): boolean =>
  /color/i.test(propName) && propName.endsWith("ClassName");

const isStyleProp = (propName: string): boolean =>
  propName === "style" || propName.endsWith("Style");

const colorFromStyle = (style: RNStyle): RNStyle[keyof RNStyle] | undefined =>
  style.accentColor ??
  style.color ??
  style.tintColor ??
  style.backgroundColor ??
  style.borderColor ??
  style.fill ??
  style.stroke;

const HOST_COLOR_PROPS = [
  "placeholderTextColor",
  "selectionColor",
  "cursorColor",
  "selectionHandleColor",
  "underlineColorAndroid",
] as const;

const stateFromPressable = (
  state: unknown,
  disabled: boolean,
): Partial<ComponentState> => {
  const value =
    state && typeof state === "object"
      ? (state as Record<string, unknown>)
      : {};
  return {
    isActive: Boolean(value.pressed),
    isFocused: Boolean(value.focused),
    isHovered: Boolean(value.hovered),
    isDisabled: disabled,
  };
};

const INTERACTIVE_VARIANTS = new Set([
  "active",
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "disabled",
  "enabled",
]);

function hasInteractiveVariant(className: string): boolean {
  const tokens = className.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const buckets = getClassBuckets(token);
    if (!buckets) continue;
    if (buckets.some((bucket) => INTERACTIVE_VARIANTS.has(bucket.variant))) {
      return true;
    }
  }
  return false;
}

function resolveGeneratedProps<P>(
  props: Record<string, unknown>,
  snapshot: RuntimeSnapshot,
  options?: WithNitrowindOptions<P>,
): Record<string, unknown> {
  const source = props;
  const generated: Record<string, unknown> = {};
  const propOptions = propOptionsFor(options);

  if (propOptions) {
    for (const [propName, option] of Object.entries(
      propOptions as Record<string, NitrowindPropMapping | undefined>,
    )) {
      if (!option) continue;
      const className = source[option.fromClassName];
      if (typeof className !== "string" || className.length === 0) continue;

      const resolved = resolveStyles(className, snapshot).styles;
      if (option.styleProperty) {
        if (source[propName] !== undefined) continue;
        generated[propName] = resolved[option.styleProperty];
        continue;
      }

      if (isStyleProp(propName)) {
        const existing = source[propName];
        generated[propName] = existing ? [resolved, existing] : resolved;
      } else if (source[propName] === undefined) {
        generated[propName] = resolved;
      }
    }
    return generated;
  }

  for (const [propName, propValue] of Object.entries(source)) {
    if (typeof propValue !== "string" || !isClassProp(propName)) continue;

    if (isColorClassProp(propName)) {
      const colorProp = classToColorProp(propName);
      if (source[colorProp] !== undefined) continue;
      generated[colorProp] = colorFromStyle(
        resolveStyles(propValue, snapshot).styles,
      );
      continue;
    }

    const styleProp = classToStyleProp(propName);
    const existing = source[styleProp];
    const resolved = resolveStyles(propValue, snapshot).styles;
    generated[styleProp] = existing ? [resolved, existing] : resolved;
  }

  return generated;
}

function resolveHostColorProps(
  style: RNStyle,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const generated: Record<string, unknown> = {};
  for (const prop of HOST_COLOR_PROPS) {
    if (source[prop] !== undefined) continue;
    const value = style[prop];
    if (value !== undefined) generated[prop] = value;
  }
  return generated;
}

function resolveNativeAccents<P>(
  props: Record<string, unknown>,
  snapshot: RuntimeSnapshot,
  options?: WithNitrowindOptions<P>,
): NativeAccentDescriptor[] {
  const accents: NativeAccentDescriptor[] = [];
  const explicit = nativeColorPropsFor(options);

  for (const [propName, propValue] of Object.entries(props)) {
    if (typeof propValue !== "string" || !isClassProp(propName)) continue;
    const nativeProp =
      explicit[propName] ??
      (isColorClassProp(propName) ? classToColorProp(propName) : undefined);
    if (!nativeProp) continue;
    const resolved = resolveStyles(propValue, snapshot);
    accents.push({
      className: propValue,
      prop: nativeProp,
      dependencies: resolved.dependencies,
    });
  }

  if (typeof props.className === "string" && props.className.length > 0) {
    const resolved = resolveStyles(props.className, snapshot);
    for (const prop of HOST_COLOR_PROPS) {
      if (resolved.styles[prop] !== undefined) {
        accents.push({
          className: props.className,
          prop,
          dependencies: resolved.dependencies,
        });
      }
    }
  }

  return accents;
}

/**
 * Wrap any component that accepts a `style` prop so it understands `className`.
 * Use this for third-party components (e.g. `Pressable`, `Image`, custom views)
 * that you want to drive with nitrowind classes.
 */
export function withNitrowind<P extends { style?: StyleProp<unknown> }>(
  Component: ComponentType<P>,
  componentName: string = Component.displayName ||
    Component.name ||
    "Component",
  options?: WithNitrowindOptions<P>,
): ComponentType<
  P & WithNitrowindProps & PseudoStateProp & { ref?: Ref<unknown> }
> {
  const Wrapped = forwardRef<
    unknown,
    P &
      WithNitrowindProps &
      PseudoStateProp & {
        children?: React.ReactNode;
      }
  >(function NitrowindComponent(
    { className = "", style, __nitrowindPseudoState, children, ...rest },
    forwardedRef,
  ) {
    const snapshot = useReactiveSnapshot();
    const resolved = useMemo(
      () => resolveStyles(className, snapshot, __nitrowindPseudoState),
      [className, snapshot, __nitrowindPseudoState],
    );
    const generatedProps = useMemo(
      () =>
        resolveGeneratedProps(
          rest as Record<string, unknown>,
          snapshot,
          options,
        ),
      [rest, snapshot],
    );
    const nativeAccents = useMemo(
      () =>
        resolveNativeAccents(
          { className, ...(rest as Record<string, unknown>) },
          snapshot,
          options,
        ),
      [className, rest, snapshot],
    );
    const ref = useLinkedRef<unknown>(
      className,
      componentName,
      resolved,
      snapshot,
      forwardedRef,
      nativeAccents,
      __nitrowindPseudoState,
    );

    const {
      onLayout: containerOnLayout,
      containerStyle,
      provider,
    } = useContainer(resolved);

    const userOnLayout = (rest as { onLayout?: (e: LayoutChangeEvent) => void })
      .onLayout;
    const handleLayout = useCallback(
      (event: LayoutChangeEvent) => {
        containerOnLayout?.(event);
        userOnLayout?.(event);
      },
      [containerOnLayout, userOnLayout],
    );
    const gridFallback = useGridFallback(
      children,
      className,
      containerOnLayout || userOnLayout ? handleLayout : undefined,
    );

    const Comp = Component as ComponentType<Record<string, unknown>>;
    // A class using an animation utility swaps the host for its Reanimated
    // equivalent so entering/exiting/layout + CSS animations can run.
    const isPressable = componentName === "Pressable";
    const needsPressableState = isPressable && hasInteractiveVariant(className);
    const Animated =
      resolved.isAnimated && !isPressable
        ? getAnimatedComponent(Component as ComponentType<unknown>)
        : null;
    const PressableAnimatedSurface =
      isPressable && resolved.isAnimated
        ? (getAnimatedView() as ComponentType<{
            children?: React.ReactNode;
            style?: unknown;
          }> | null)
        : null;
    const pressableChildrenIsFunction =
      isPressable && typeof gridFallback.children === "function";
    const needsPressableRenderFunction =
      isPressable &&
      (needsPressableState ||
        pressableChildrenIsFunction ||
        Boolean(PressableAnimatedSurface));
    const Host = (Animated ?? Comp) as ComponentType<Record<string, unknown>>;
    const animationProps = Animated
      ? {
          entering: resolved.entering,
          exiting: resolved.exiting,
          layout: resolved.layout,
        }
      : undefined;
    const { style: generatedStyle, ...hostGeneratedProps } = generatedProps;
    const classHostColorProps = resolveHostColorProps(
      resolved.styles,
      rest as Record<string, unknown>,
    );
    // Preserve callback styles (e.g. `Pressable`'s `style={(state) => …}`) by
    // composing them rather than discarding them.
    const disabled = Boolean((rest as { disabled?: unknown }).disabled);
    const mergedStyle = PressableAnimatedSurface
      ? undefined
      : needsPressableState || typeof style === "function"
        ? (state: unknown) => [
            needsPressableState
              ? resolveStyles(className, snapshot, {
                  ...__nitrowindPseudoState,
                  ...stateFromPressable(state, disabled),
                }).styles
              : resolved.styles,
            containerStyle,
            generatedStyle,
            typeof style === "function"
              ? (style as (s: unknown) => unknown)(state)
              : style,
          ]
        : [resolved.styles, containerStyle, generatedStyle, style];
    const renderedChildren = needsPressableRenderFunction
      ? (state: unknown) => {
          const pressableState = {
            ...__nitrowindPseudoState,
            ...(needsPressableState ? stateFromPressable(state, disabled) : {}),
          };
          const sourceChildren =
            typeof gridFallback.children === "function"
              ? (gridFallback.children as (s: unknown) => React.ReactNode)(
                  state,
                )
              : gridFallback.children;
          const content = withChildPseudoState(
            needsPressableState
              ? withComponentPseudoState(sourceChildren, pressableState)
              : sourceChildren,
          );
          if (!PressableAnimatedSurface) return content;
          return (
            <PressableAnimatedSurface
              style={[
                needsPressableState
                  ? resolveStyles(className, snapshot, pressableState).styles
                  : resolved.styles,
                containerStyle,
                generatedStyle,
                typeof style === "function"
                  ? (style as (s: unknown) => unknown)(state)
                  : style,
              ]}
            >
              {content}
            </PressableAnimatedSurface>
          );
        }
      : withChildPseudoState(gridFallback.children);
    const node = (
      <Host
        ref={ref}
        {...(rest as Record<string, unknown>)}
        {...classHostColorProps}
        {...hostGeneratedProps}
        {...animationProps}
        style={mergedStyle}
        onLayout={gridFallback.onLayout}
      >
        {renderedChildren}
      </Host>
    );

    return provider ? (
      <ContainerProvider value={provider}>{node}</ContainerProvider>
    ) : (
      node
    );
  });

  Wrapped.displayName = `withNitrowind(${componentName})`;
  return Wrapped as unknown as ComponentType<
    P & WithNitrowindProps & PseudoStateProp & { ref?: Ref<unknown> }
  >;
}
