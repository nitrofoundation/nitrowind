"use strict";

import React, { forwardRef, useCallback, useMemo, useRef } from "react";
import { resolveStyles } from "../core/store.js";
import { getClassBuckets } from "../core/registry.js";
import { hasNativeEngine } from "../core/native.js";
import { getAnimatedComponent, getAnimatedView } from "../components/animated.js";
import { ContainerProvider, useContainer } from "../components/containerContext.js";
import { useGridFallback } from "../components/grid.js";
import { setNativeComponentStateForNode, setNativeGroupStateForNode, useLinkedRef, useReactiveSnapshot } from "../components/internal.js";
import { withChildPseudoState, withComponentPseudoState } from "../components/pseudo.js";
import { jsx as _jsx } from "react/jsx-runtime";
const isAdvancedOptions = options => !!options && ("props" in options || "nativeColorProps" in options);
const propOptionsFor = options => {
  if (!options) return undefined;
  return isAdvancedOptions(options) ? options.props : options;
};
const nativeColorPropsFor = options => isAdvancedOptions(options) ? options.nativeColorProps ?? {} : {};
const classToStyleProp = propName => propName === "className" ? "style" : propName.replace(/ClassName$/, "Style");
const classToColorProp = propName => propName.replace(/ClassName$/, "");
const isClassProp = propName => propName === "className" || propName.endsWith("ClassName");
const isColorClassProp = propName => /color/i.test(propName) && propName.endsWith("ClassName");
const isStyleProp = propName => propName === "style" || propName.endsWith("Style");
const colorFromStyle = style => style.accentColor ?? style.color ?? style.tintColor ?? style.backgroundColor ?? style.borderColor ?? style.fill ?? style.stroke;
const HOST_COLOR_PROPS = ["placeholderTextColor", "selectionColor", "cursorColor", "selectionHandleColor", "underlineColorAndroid"];
const stateFromPressable = (state, disabled) => {
  const value = state && typeof state === "object" ? state : {};
  return {
    isActive: Boolean(value.pressed),
    isFocused: Boolean(value.focused),
    isHovered: Boolean(value.hovered),
    isDisabled: disabled
  };
};
const groupStateFromPressable = (state, disabled) => {
  const value = state && typeof state === "object" ? state : {};
  return {
    isGroupActive: Boolean(value.pressed),
    isGroupFocused: Boolean(value.focused),
    isGroupHovered: Boolean(value.hovered),
    isGroupDisabled: disabled
  };
};
const INTERACTIVE_VARIANTS = new Set(["active", "hover", "focus", "focus-visible", "focus-within", "disabled", "enabled"]);
function hasInteractiveVariant(className) {
  const tokens = className.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    const buckets = getClassBuckets(token);
    if (!buckets) continue;
    if (buckets.some(bucket => INTERACTIVE_VARIANTS.has(bucket.variant))) {
      return true;
    }
  }
  return false;
}
function hasGroupMarker(className) {
  return className.split(/\s+/).some(token => token === "group" || token.startsWith("group/"));
}
function resolveGeneratedProps(props, snapshot, options) {
  const source = props;
  const generated = {};
  const propOptions = propOptionsFor(options);
  if (propOptions) {
    for (const [propName, option] of Object.entries(propOptions)) {
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
      generated[colorProp] = colorFromStyle(resolveStyles(propValue, snapshot).styles);
      continue;
    }
    const styleProp = classToStyleProp(propName);
    const existing = source[styleProp];
    const resolved = resolveStyles(propValue, snapshot).styles;
    generated[styleProp] = existing ? [resolved, existing] : resolved;
  }
  return generated;
}
function resolveHostColorProps(style, source) {
  const generated = {};
  for (const prop of HOST_COLOR_PROPS) {
    if (source[prop] !== undefined) continue;
    const value = style[prop];
    if (value !== undefined) generated[prop] = value;
  }
  return generated;
}
function resolveNativeAccents(props, snapshot, options, native = false) {
  const accents = [];
  const propOptions = propOptionsFor(options);
  if (native && propOptions) {
    for (const [propName, option] of Object.entries(propOptions)) {
      if (!option || props[propName] !== undefined) continue;
      const className = props[option.fromClassName];
      if (typeof className !== "string" || className.length === 0) continue;
      accents.push({
        className,
        prop: propName,
        dependencies: [],
        sourceProperty: option.styleProperty ? String(option.styleProperty) : isStyleProp(propName) ? "*" : undefined
      });
    }
    return accents;
  }
  const explicit = nativeColorPropsFor(options);
  for (const [propName, propValue] of Object.entries(props)) {
    if (typeof propValue !== "string" || !isClassProp(propName)) continue;
    const nativeProp = explicit[propName] ?? (isColorClassProp(propName) ? classToColorProp(propName) : undefined);
    if (!nativeProp) continue;
    accents.push({
      className: propValue,
      prop: nativeProp,
      dependencies: native ? [] : resolveStyles(propValue, snapshot).dependencies
    });
  }
  if (typeof props.className === "string" && props.className.length > 0) {
    if (native) {
      for (const prop of HOST_COLOR_PROPS) {
        if (props[prop] === undefined) {
          accents.push({
            className: props.className,
            prop,
            dependencies: []
          });
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
          dependencies: resolved.dependencies
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
export function withNitrowind(Component, componentName = Component.displayName || Component.name || "Component", options) {
  const Wrapped = /*#__PURE__*/forwardRef(function NitrowindComponent({
    className = "",
    style,
    __nitrowindPseudoState,
    children,
    ...rest
  }, forwardedRef) {
    const snapshot = useReactiveSnapshot();
    const native = hasNativeEngine();
    const nativeHandleRef = useRef(undefined);
    const resolved = useMemo(() => resolveStyles(className, snapshot, __nitrowindPseudoState), [className, snapshot, __nitrowindPseudoState]);
    const generatedProps = useMemo(() => resolveGeneratedProps(rest, snapshot, options), [rest, snapshot]);
    const nativeAccents = useMemo(() => resolveNativeAccents({
      className,
      ...rest
    }, snapshot, options, native), [className, native, rest, snapshot]);
    const ref = useLinkedRef(className, componentName, resolved, snapshot, forwardedRef, nativeAccents, __nitrowindPseudoState, useCallback(handle => {
      nativeHandleRef.current = handle;
    }, []), typeof style === "function" ? undefined : style);
    const {
      onLayout: containerOnLayout,
      containerStyle,
      provider
    } = useContainer(resolved);
    const userOnLayout = rest.onLayout;
    const handleLayout = useCallback(event => {
      containerOnLayout?.(event);
      userOnLayout?.(event);
    }, [containerOnLayout, userOnLayout]);
    const gridFallback = useGridFallback(children, className, containerOnLayout || userOnLayout ? handleLayout : undefined, [resolved.styles, containerStyle, generatedProps.style, typeof style === "function" ? undefined : style]);
    const Comp = Component;
    // A class using an animation utility swaps the host for its Reanimated
    // equivalent so entering/exiting/layout + CSS animations can run.
    const isPressable = componentName === "Pressable";
    const needsPressableState = isPressable && !native && hasInteractiveVariant(className);
    const needsGroupState = isPressable && !native && hasGroupMarker(className);
    const updatesNativePressableState = isPressable && native;
    const Animated = resolved.isAnimated && !isPressable ? getAnimatedComponent(Component) : null;
    const PressableAnimatedSurface = isPressable && resolved.isAnimated ? getAnimatedView() : null;
    const pressableChildrenIsFunction = isPressable && typeof gridFallback.children === "function";
    const needsPressableRenderFunction = isPressable && (needsPressableState || needsGroupState || updatesNativePressableState || pressableChildrenIsFunction || Boolean(PressableAnimatedSurface));
    const Host = Animated ?? Comp;
    const animationProps = Animated ? {
      entering: resolved.entering,
      exiting: resolved.exiting,
      layout: resolved.layout
    } : undefined;
    const {
      style: generatedStyle,
      ...hostGeneratedProps
    } = generatedProps;
    const classHostColorProps = resolveHostColorProps(resolved.styles, rest);
    // Preserve callback styles (e.g. `Pressable`'s `style={(state) => …}`) by
    // composing them rather than discarding them.
    const disabled = Boolean(rest.disabled);
    const updateNativePressableState = useCallback(state => {
      if (!updatesNativePressableState) return;
      const next = stateFromPressable(state, disabled);
      setNativeComponentStateForNode(nativeHandleRef.current, next);
      setNativeGroupStateForNode(nativeHandleRef.current, next);
    }, [disabled, updatesNativePressableState]);
    const mergedStyle = PressableAnimatedSurface ? undefined : needsPressableState || updatesNativePressableState || typeof style === "function" ? state => {
      updateNativePressableState(state);
      return [needsPressableState ? resolveStyles(className, snapshot, {
        ...__nitrowindPseudoState,
        ...stateFromPressable(state, disabled)
      }).styles : resolved.styles, containerStyle, generatedStyle, typeof style === "function" ? style(state) : style];
    } : [resolved.styles, containerStyle, generatedStyle, style];
    const renderedChildren = needsPressableRenderFunction ? state => {
      updateNativePressableState(state);
      const pressableState = {
        ...__nitrowindPseudoState,
        ...(needsPressableState ? stateFromPressable(state, disabled) : {}),
        ...(needsGroupState ? groupStateFromPressable(state, disabled) : {})
      };
      const sourceChildren = typeof gridFallback.children === "function" ? gridFallback.children(state) : gridFallback.children;
      const content = withChildPseudoState(needsPressableState || needsGroupState ? withComponentPseudoState(sourceChildren, pressableState, snapshot) : sourceChildren, snapshot);
      if (!PressableAnimatedSurface) return content;
      return /*#__PURE__*/_jsx(PressableAnimatedSurface, {
        style: [needsPressableState ? resolveStyles(className, snapshot, pressableState).styles : resolved.styles, containerStyle, generatedStyle, typeof style === "function" ? style(state) : style],
        children: content
      });
    } : withChildPseudoState(gridFallback.children, snapshot);
    const node = /*#__PURE__*/_jsx(Host, {
      ref: ref,
      ...rest,
      ...classHostColorProps,
      ...hostGeneratedProps,
      ...animationProps,
      style: mergedStyle,
      onLayout: gridFallback.onLayout,
      children: renderedChildren
    });
    return provider ? /*#__PURE__*/_jsx(ContainerProvider, {
      value: provider,
      children: node
    }) : node;
  });
  Wrapped.displayName = `withNitrowind(${componentName})`;
  return Wrapped;
}

/**
 * Native-first variant of `withNitrowind` for third-party host components.
 *
 * JS registers className/prop mapping metadata; when the native engine is
 * present, C++ resolves and commits the mapped props/styles directly.
 */
export function withNativeExtending(Component, componentName, options) {
  return withNitrowind(Component, componentName, options);
}
//# sourceMappingURL=withNitrowind.js.map