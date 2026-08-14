import React, {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  type ComponentType,
  type Ref,
} from "react";
import {
  Platform,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { resolveStyles, resolveStylesForPlatform } from "../core/store";
import { getClassBuckets } from "../core/registry";
import { hasNativeEngine } from "../core/native";
import type { RNStyle } from "../compiler/types";
import type { ComponentState, RuntimeSnapshot } from "../specs/types";
import { getAnimatedComponent, getAnimatedView } from "../components/animated";
import {
  ContainerProvider,
  useContainer,
} from "../components/containerContext";
import { serializeGridConfig, useGridFallback } from "../components/grid";
import type { NativeAccentDescriptor } from "../components/internal";
import {
  setNativeComponentStateForNode,
  setNativeGroupStateForNode,
  useLinkedRef,
  useReactiveSnapshot,
} from "../components/internal";
import type { ShadowNodeHandle } from "../specs/ShadowNodeHandle.nitro";
import {
  type PseudoStateProp,
  withChildPseudoState,
  withComponentPseudoState,
} from "../components/pseudo";
import { useAccessibilityClassName } from "../accessibility/native";

export interface WithNitroCssProps {
  className?: string;
  style?: StyleProp<unknown>;
}

export interface NitroCssPropMapping {
  fromClassName: string;
  styleProperty?: keyof RNStyle;
  nativeProp?: string;
}

export type WithNitroCssPropOptions<P> = Partial<
  Record<keyof P & string, NitroCssPropMapping>
>;

export interface WithNitroCssAdvancedOptions<P> {
  props?: Partial<Record<keyof P & string, NitroCssPropMapping>>;
  nativeColorProps?: Record<string, string>;
  /**
   * Whether explicit prop mappings may be committed directly by the native
   * engine. Disable this for components whose JS layer transforms prop values
   * before they reach Fabric (for example react-native-svg paint strings).
   */
  nativePropMapping?: boolean;
}

export type WithNitroCssOptions<P> =
  | WithNitroCssPropOptions<P>
  | WithNitroCssAdvancedOptions<P>;

const isAdvancedOptions = <P,>(
  options: WithNitroCssOptions<P> | undefined,
): options is WithNitroCssAdvancedOptions<P> =>
  !!options && ("props" in options || "nativeColorProps" in options);

const propOptionsFor = <P,>(
  options: WithNitroCssOptions<P> | undefined,
): WithNitroCssPropOptions<P> | undefined => {
  if (!options) return undefined;
  return isAdvancedOptions(options) ? options.props : options;
};

const nativeColorPropsFor = <P,>(
  options: WithNitroCssOptions<P> | undefined,
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

const groupStateFromPressable = (
  state: unknown,
  disabled: boolean,
): Record<string, boolean> => {
  const value =
    state && typeof state === "object"
      ? (state as Record<string, unknown>)
      : {};
  return {
    isGroupActive: Boolean(value.pressed),
    isGroupFocused: Boolean(value.focused),
    isGroupHovered: Boolean(value.hovered),
    isGroupDisabled: disabled,
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

function hasGroupMarker(className: string): boolean {
  return className
    .split(/\s+/)
    .some((token) => token === "group" || token.startsWith("group/"));
}

export function resolveGeneratedProps<P>(
  props: Record<string, unknown>,
  snapshot: RuntimeSnapshot,
  options?: WithNitroCssOptions<P>,
  hostClassName?: string,
): Record<string, unknown> {
  const generated: Record<string, unknown> = {};
  const propOptions = propOptionsFor(options);
  const explicitlyMappedSources = new Set<string>();

  // The wrapper destructures `className` off the props before delegating here,
  // so mappings that read `fromClassName: "className"` (e.g. the svg preset)
  // receive it explicitly. Only the explicit-mapping branch may see it — the
  // generic scan below must not, or it would re-apply `className` as `style`.
  const source: Record<string, unknown> =
    propOptions && hostClassName && props.className === undefined
      ? { ...props, className: hostClassName }
      : props;

  if (propOptions) {
    for (const [propName, option] of Object.entries(
      propOptions as Record<string, NitroCssPropMapping | undefined>,
    )) {
      if (!option) continue;
      explicitlyMappedSources.add(option.fromClassName);
      const className = source[option.fromClassName];
      if (typeof className !== "string" || className.length === 0) continue;

      const resolved = resolveStyles(className, snapshot).styles;
      if (option.styleProperty) {
        if (source[propName] !== undefined) continue;
        const value = resolved[option.styleProperty];
        if (value !== undefined) generated[propName] = value;
        continue;
      }

      if (isStyleProp(propName)) {
        const existing = source[propName];
        generated[propName] = existing ? [resolved, existing] : resolved;
      } else if (source[propName] === undefined) {
        generated[propName] = resolved;
      }
    }
  }

  for (const [propName, propValue] of Object.entries(source)) {
    if (typeof propValue !== "string" || !isClassProp(propName)) continue;
    if (propName === "className" || explicitlyMappedSources.has(propName)) {
      continue;
    }

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
  options?: WithNitroCssOptions<P>,
  native = false,
): NativeAccentDescriptor[] {
  const accents: NativeAccentDescriptor[] = [];
  const propOptions = propOptionsFor(options);

  if (
    native &&
    isAdvancedOptions(options) &&
    options.nativePropMapping === false
  ) {
    return accents;
  }

  if (native && propOptions) {
    for (const [propName, option] of Object.entries(
      propOptions as Record<string, NitroCssPropMapping | undefined>,
    )) {
      if (!option || props[propName] !== undefined) continue;
      const className = props[option.fromClassName];
      if (typeof className !== "string" || className.length === 0) continue;
      accents.push({
        className,
        prop: propName,
        dependencies: [],
        sourceProperty: option.styleProperty
          ? String(option.styleProperty)
          : isStyleProp(propName)
            ? "*"
            : undefined,
      });
    }
    return accents;
  }

  const explicit = nativeColorPropsFor(options);

  for (const [propName, propValue] of Object.entries(props)) {
    if (typeof propValue !== "string" || !isClassProp(propName)) continue;
    const nativeProp =
      explicit[propName] ??
      (isColorClassProp(propName) ? classToColorProp(propName) : undefined);
    if (!nativeProp) continue;
    accents.push({
      className: propValue,
      prop: nativeProp,
      dependencies: native
        ? []
        : resolveStyles(propValue, snapshot).dependencies,
    });
  }

  if (typeof props.className === "string" && props.className.length > 0) {
    if (native) {
      for (const prop of HOST_COLOR_PROPS) {
        if (props[prop] === undefined) {
          accents.push({ className: props.className, prop, dependencies: [] });
        }
      }
      return accents;
    }
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
 * that you want to drive with nitrocss classes.
 */
export function withNitroCss<P extends { style?: StyleProp<unknown> }>(
  Component: ComponentType<P>,
  componentName: string = Component.displayName ||
    Component.name ||
    "Component",
  options?: WithNitroCssOptions<P>,
): ComponentType<
  P & WithNitroCssProps & PseudoStateProp & { ref?: Ref<unknown> }
> {
  type WrappedProps = P &
    WithNitroCssProps &
    PseudoStateProp & {
      children?: React.ReactNode;
    };

  const Wrapped = forwardRef<unknown, WrappedProps>(function NitroCssComponent(
    { className: requestedClassName = "", style, __nitrocssPseudoState, children, ...rest },
    forwardedRef,
  ) {
    const className = useAccessibilityClassName(requestedClassName);
    const snapshot = useReactiveSnapshot();
    const isWeb = Platform.OS === "web";
    const native = !isWeb && hasNativeEngine();
    const nativeHandleRef = useRef<ShadowNodeHandle | undefined>(undefined);
    const resolved = useMemo(
      () =>
        resolveStylesForPlatform(className, snapshot, __nitrocssPseudoState),
      [className, snapshot, __nitrocssPseudoState],
    );
    const generatedProps = useMemo<Record<string, unknown>>(
      () =>
        isWeb
          ? {}
          : resolveGeneratedProps(
              rest as Record<string, unknown>,
              snapshot,
              options,
              className,
            ),
      [className, isWeb, rest, snapshot, options],
    );
    const nativeAccents = useMemo<NativeAccentDescriptor[]>(
      () =>
        isWeb
          ? []
          : resolveNativeAccents(
              { className, ...(rest as Record<string, unknown>) },
              snapshot,
              options,
              native,
            ),
      [className, isWeb, native, rest, snapshot, options],
    );
    // Native grid config for grid-container wrappers (Stacks, etc.); `undefined`
    // on web / non-grids / grids the native engine can't handle.
    const gridConfig = useMemo(
      () =>
        isWeb
          ? undefined
          : serializeGridConfig(
              className,
              children,
              [
                resolved.styles,
                typeof style === "function"
                  ? undefined
                  : (style as StyleProp<ViewStyle>),
              ],
            ),
      [isWeb, className, children, resolved.styles, style],
    );
    const ref = useLinkedRef<unknown>(
      className,
      componentName,
      resolved,
      snapshot,
      forwardedRef,
      nativeAccents,
      __nitrocssPseudoState,
      useCallback((handle: ShadowNodeHandle | undefined) => {
        nativeHandleRef.current = handle;
      }, []),
      typeof style === "function" ? undefined : style,
      gridConfig,
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
      [
        resolved.styles,
        containerStyle,
        generatedProps.style as StyleProp<ViewStyle>,
        (typeof style === "function"
          ? undefined
          : style) as StyleProp<ViewStyle>,
      ],
    );

    const Comp = Component as ComponentType<Record<string, unknown>>;
    // A class using an animation utility swaps the host for its Reanimated
    // equivalent so entering/exiting/layout + CSS animations can run.
    const isPressable = componentName === "Pressable";
    const needsPressableState =
      !isWeb && isPressable && !native && hasInteractiveVariant(className);
    const needsGroupState =
      !isWeb && isPressable && !native && hasGroupMarker(className);
    const updatesNativePressableState = !isWeb && isPressable && native;
    const Animated =
      !isWeb && resolved.isAnimated && !isPressable
        ? getAnimatedComponent(Component as ComponentType<unknown>)
        : null;
    const PressableAnimatedSurface =
      !isWeb && isPressable && resolved.isAnimated
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
        needsGroupState ||
        updatesNativePressableState ||
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
    const classHostColorProps = isWeb
      ? {}
      : resolveHostColorProps(
          resolved.styles,
          rest as Record<string, unknown>,
        );
    // Preserve callback styles (e.g. `Pressable`'s `style={(state) => …}`) by
    // composing them rather than discarding them.
    const disabled = Boolean((rest as { disabled?: unknown }).disabled);
    const updateNativePressableState = useCallback(
      (state: unknown) => {
        if (!updatesNativePressableState) return;
        const next = stateFromPressable(state, disabled);
        setNativeComponentStateForNode(nativeHandleRef.current, next);
        setNativeGroupStateForNode(nativeHandleRef.current, next);
      },
      [disabled, updatesNativePressableState],
    );
    const mergedStyle = isWeb
      ? style
      : PressableAnimatedSurface
        ? undefined
        : needsPressableState ||
          updatesNativePressableState ||
          typeof style === "function"
        ? (state: unknown) => {
            updateNativePressableState(state);
            return [
              needsPressableState
                ? resolveStyles(className, snapshot, {
                    ...__nitrocssPseudoState,
                    ...stateFromPressable(state, disabled),
                  }).styles
                : resolved.styles,
              containerStyle,
              generatedStyle,
              typeof style === "function"
                ? (style as (s: unknown) => unknown)(state)
                : style,
            ];
          }
        : [resolved.styles, containerStyle, generatedStyle, style];
    const renderedChildren = (() => {
      if (isWeb) return gridFallback.children;
      if (!needsPressableRenderFunction) {
        return withChildPseudoState(gridFallback.children, snapshot);
      }
      return (state: unknown) => {
        updateNativePressableState(state);
        const pressableState = {
          ...__nitrocssPseudoState,
          ...(needsPressableState ? stateFromPressable(state, disabled) : {}),
          ...(needsGroupState ? groupStateFromPressable(state, disabled) : {}),
        };
        const sourceChildren =
          typeof gridFallback.children === "function"
            ? (gridFallback.children as (s: unknown) => React.ReactNode)(state)
            : gridFallback.children;
        const content = withChildPseudoState(
          needsPressableState || needsGroupState
            ? withComponentPseudoState(sourceChildren, pressableState, snapshot)
            : sourceChildren,
          snapshot,
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
      };
    })();
    const webProps: Record<string, unknown> =
      isWeb && className ? { className } : {};
    const node = (
      <Host
        ref={ref}
        {...webProps}
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

  Wrapped.displayName = `withNitroCss(${componentName})`;
  return Wrapped as unknown as ComponentType<
    P & WithNitroCssProps & PseudoStateProp & { ref?: Ref<unknown> }
  >;
}

/**
 * Native-first variant of `withNitroCss` for third-party host components.
 *
 * JS registers className/prop mapping metadata; when the native engine is
 * present, C++ resolves and commits the mapped props/styles directly.
 */
export function withNativeExtending<P extends object>(
  Component: ComponentType<P>,
  componentName?: string,
  options?: WithNitroCssOptions<P>,
): ComponentType<
  P & WithNitroCssProps & PseudoStateProp & { ref?: Ref<unknown> }
> {
  return withNitroCss(Component, componentName, options);
}
