import { useCallback, useEffect, useRef, type Ref } from "react";
import type { RNStyle } from "../compiler/types";
import type { Accent } from "../specs/ShadowRegistry.nitro";
import { type ComponentState, type RuntimeSnapshot } from "../specs/types";
import { getEngine, hasNativeEngine } from "../core/native";
import { runtime } from "../core/runtime";
import type { GetStylesResult } from "../core/types";

/** Assign a value to either a callback ref or a mutable ref object. */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else (ref as { current: T | null }).current = value;
}

interface FabricInstanceHandle {
  stateNode?: { node?: Record<string, unknown> };
}

interface FabricRef {
  __internalInstanceHandle?: FabricInstanceHandle;
  getNativeScrollRef?: () => FabricRef | null | undefined;
  getScrollableNode?: () => FabricRef | null | undefined;
}

export interface NativeAccentDescriptor {
  className: string;
  prop: string;
  dependencies: Accent["dependencies"];
}

function normalizeComponentState(
  state: Partial<ComponentState> | undefined,
): ComponentState | undefined {
  if (!state) return undefined;
  return {
    isFocused: Boolean(state.isFocused),
    isActive: Boolean(state.isActive),
    isDisabled: Boolean(state.isDisabled),
    isHovered: Boolean(state.isHovered),
    isFirstChild: Boolean(state.isFirstChild),
    isLastChild: Boolean(state.isLastChild),
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
function shadowNodeWrapperFromRef(
  ref: unknown,
): Record<string, unknown> | null {
  if (ref == null || typeof ref !== "object") return null;
  const r = ref as FabricRef;
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

/**
 * Link a freshly-mounted host component to the native ShadowRegistry so the C++
 * engine owns its future style updates. Returns a cleanup (unlink) function, or
 * `undefined` when no native engine is available (fallback path).
 */
export function linkNode(
  instance: unknown,
  className: string,
  componentName: string,
  resolved: GetStylesResult,
  snapshot: RuntimeSnapshot,
  nativeAccents: NativeAccentDescriptor[] = [],
  componentState?: Partial<ComponentState>,
): (() => void) | undefined {
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
    inline.fromJSObject({});

    const accents: Accent[] = nativeAccents.map((accent) => ({
      handle,
      className: accent.className,
      accentKey: accent.prop,
      dependencies: accent.dependencies,
      meta: {},
    }));

    engine.Registry.link(
      handle,
      className,
      componentName,
      resolved.dependencies,
      accents,
      inline,
      normalizeComponentState(componentState),
      undefined,
      {
        currentThemeName: snapshot.currentThemeName,
        colorScheme: snapshot.colorScheme,
        rtl: snapshot.rtl,
      },
    );

    return () => {
      try {
        engine.Registry.unlink(handle);
      } catch {
        /* node already gone */
      }
    };
  } catch {
    return undefined;
  }
}

/**
 * Return the first-paint runtime snapshot for host style resolution. Host
 * components never subscribe to runtime dependency changes; after mount the
 * native engine owns style updates, and explicit hooks (`useTheme`,
 * `useColorScheme`, etc.) are the only JS opt-in reactivity path.
 */
export function useReactiveSnapshot(): RuntimeSnapshot {
  const initialSnapshot = useRef<RuntimeSnapshot | undefined>(undefined);
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
export function useLinkedRef<T>(
  className: string,
  componentName: string,
  resolved: GetStylesResult,
  snapshot: RuntimeSnapshot,
  forwardedRef: Ref<T> | undefined,
  nativeAccents: NativeAccentDescriptor[] = [],
  componentState?: Partial<ComponentState>,
): (node: T | null) => void {
  const cleanup = useRef<(() => void) | undefined>(undefined);

  return useCallback(
    (node: T | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      if (node) {
        cleanup.current = linkNode(
          node,
          className,
          componentName,
          resolved,
          snapshot,
          nativeAccents,
          componentState,
        );
      }
      assignRef(forwardedRef, node);
    },
    [
      className,
      componentName,
      resolved,
      snapshot,
      forwardedRef,
      nativeAccents,
      componentState,
    ],
  );
}

export type { RNStyle };
