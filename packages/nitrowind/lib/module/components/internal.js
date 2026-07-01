"use strict";

import { useCallback, useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { getEngine, hasNativeEngine } from "../core/native.js";
import { runtime } from "../core/runtime.js";
/** Assign a value to either a callback ref or a mutable ref object. */
export function assignRef(ref, value) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);else ref.current = value;
}
function normalizeComponentState(state) {
  if (!state) return undefined;
  return {
    isFocused: Boolean(state.isFocused),
    isActive: Boolean(state.isActive),
    isDisabled: Boolean(state.isDisabled),
    isHovered: Boolean(state.isHovered),
    isFirstChild: Boolean(state.isFirstChild),
    isLastChild: Boolean(state.isLastChild)
  };
}

/**
 * Extract the Fabric `ShadowNodeWrapper` (a native-state JS object) from a host
 * component ref. The C++ `JSIConverter<ShadowNode>` unwraps this object's native
 * state; passing the raw ref yields a `null` ShadowNode and the node never links.
 *
 * Mirrors React Native's / Reanimated's `getShadowNodeWrapperFromRef`: host
 * components expose `__internalInstanceHandle` directly, while scrollables hand
 * back their inner native view via `getNativeScrollRef`/`getScrollableNode`.
 */
function shadowNodeWrapperFromRef(ref) {
  if (ref == null || typeof ref !== "object") return null;
  const r = ref;
  let handle = r.__internalInstanceHandle;
  if (!handle) {
    if (typeof r.getNativeScrollRef === "function") {
      handle = r.getNativeScrollRef()?.__internalInstanceHandle;
    } else if (typeof r.getScrollableNode === "function") {
      handle = r.getScrollableNode()?.__internalInstanceHandle;
    }
  }
  return handle?.stateNode?.node ?? null;
}
function flattenInlineStyle(style) {
  if (typeof style === "function") return {};
  const flattened = StyleSheet.flatten(style);
  return flattened && typeof flattened === "object" ? flattened : {};
}

/**
 * Link a freshly-mounted host component to the native ShadowRegistry so the C++
 * engine owns its future style updates. Returns a cleanup (unlink) function, or
 * `undefined` when no native engine is available (fallback path).
 */
export function linkNode(instance, className, componentName, resolved, snapshot, nativeAccents = [], componentState, inlineStyle) {
  if (!hasNativeEngine() || !instance) return undefined;
  const engine = getEngine();
  if (!engine) return undefined;

  // The native converter needs the Fabric ShadowNodeWrapper, not the raw public
  // ref. Without this the linked ShadowNode is null and the engine silently
  // drops the node (no dynamic updates ever reach it).
  const wrapper = shadowNodeWrapperFromRef(instance);
  if (!wrapper) return undefined;
  try {
    const handle = engine.createShadowNodeHandle();
    handle.fromRef(wrapper);
    const inline = engine.createFollyStyle();
    inline.fromJSObject(flattenInlineStyle(inlineStyle));
    const accents = nativeAccents.map(accent => ({
      handle,
      className: accent.className,
      accentKey: accent.prop,
      dependencies: accent.dependencies ?? [],
      meta: accent.sourceProperty ? {
        sourceProperty: accent.sourceProperty
      } : {}
    }));
    engine.Registry.link(handle, className, componentName, resolved.dependencies, accents, inline, normalizeComponentState(componentState), undefined, {
      currentThemeName: snapshot.currentThemeName,
      colorScheme: snapshot.colorScheme,
      rtl: snapshot.rtl
    });
    const cleanup = () => {
      try {
        engine.Registry.unlink(handle);
      } catch {
        /* node already gone */
      }
    };
    return {
      handle,
      cleanup
    };
  } catch {
    return undefined;
  }
}
export function setNativeGroupStateForNode(handle, state) {
  if (!handle || !hasNativeEngine()) return;
  const engine = getEngine();
  if (!engine) return;
  try {
    engine.Registry.setGroupStateForNode(handle, normalizeComponentState(state) ?? {
      isFocused: false,
      isActive: false,
      isDisabled: false,
      isHovered: false,
      isFirstChild: false,
      isLastChild: false
    });
  } catch {
    /* native group state is best-effort */
  }
}
export function setNativeComponentStateForNode(handle, state) {
  if (!handle || !hasNativeEngine()) return;
  const engine = getEngine();
  if (!engine) return;
  try {
    engine.Registry.setComponentStateForNode(handle, normalizeComponentState(state) ?? {
      isFocused: false,
      isActive: false,
      isDisabled: false,
      isHovered: false,
      isFirstChild: false,
      isLastChild: false
    });
  } catch {
    /* native component state is best-effort */
  }
}

/**
 * Return the first-paint runtime snapshot for host style resolution. Host
 * components never subscribe to runtime dependency changes; after mount the
 * native engine owns style updates, and explicit hooks (`useTheme`,
 * `useColorScheme`, etc.) are the only JS opt-in reactivity path.
 */
export function useReactiveSnapshot() {
  const initialSnapshot = useRef(undefined);
  if (!initialSnapshot.current) initialSnapshot.current = runtime.current;
  useEffect(() => {
    runtime.start();
  }, []);
  return initialSnapshot.current;
}

/**
 * Produce a ref callback that links/unlinks the node with the native engine and
 * forwards the node to a user-provided ref.
 */
export function useLinkedRef(className, componentName, resolved, snapshot, forwardedRef, nativeAccents = [], componentState, onLinked, inlineStyle) {
  const cleanup = useRef(undefined);
  return useCallback(node => {
    cleanup.current?.();
    cleanup.current = undefined;
    if (node) {
      const registration = linkNode(node, className, componentName, resolved, snapshot, nativeAccents, componentState, inlineStyle);
      cleanup.current = registration?.cleanup;
      onLinked?.(registration?.handle);
    } else {
      onLinked?.(undefined);
    }
    assignRef(forwardedRef, node);
  }, [className, componentName, resolved, snapshot, forwardedRef, nativeAccents, componentState, onLinked, inlineStyle]);
}
//# sourceMappingURL=internal.js.map