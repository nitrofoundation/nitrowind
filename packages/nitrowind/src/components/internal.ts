import { useCallback, useEffect, useRef, type Ref } from "react";
import { Platform, StyleSheet } from "react-native";
import type { RNStyle } from "../compiler/types";
import type { Accent } from "../specs/ShadowRegistry.nitro";
import type { ShadowNodeHandle } from "../specs/ShadowNodeHandle.nitro";
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
  dependencies?: Accent["dependencies"];
  sourceProperty?: string;
}

export interface LinkedNodeRegistration {
  handle: ShadowNodeHandle;
  cleanup: () => void;
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

function flattenInlineStyle(style: unknown): Record<string, unknown> {
  if (typeof style === "function") return {};
  const flattened = StyleSheet.flatten(style as never);
  return flattened && typeof flattened === "object"
    ? (flattened as Record<string, unknown>)
    : {};
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
  inlineStyle?: unknown,
): LinkedNodeRegistration | undefined {
  if (Platform.OS === "web" || !hasNativeEngine() || !instance) {
    return undefined;
  }
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

    const accents: Accent[] = nativeAccents.map((accent) => ({
      handle,
      className: accent.className,
      accentKey: accent.prop,
      dependencies: accent.dependencies ?? [],
      meta: accent.sourceProperty
        ? { sourceProperty: accent.sourceProperty }
        : {},
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

    const cleanup = () => {
      try {
        engine.Registry.unlink(handle);
      } catch {
        /* node already gone */
      }
    };
    return { handle, cleanup };
  } catch {
    return undefined;
  }
}

export function setNativeGroupStateForNode(
  handle: ShadowNodeHandle | undefined,
  state: Partial<ComponentState>,
): void {
  if (!handle || !hasNativeEngine()) return;
  const engine = getEngine();
  if (!engine) return;
  try {
    engine.Registry.setGroupStateForNode(
      handle,
      normalizeComponentState(state) ?? {
        isFocused: false,
        isActive: false,
        isDisabled: false,
        isHovered: false,
        isFirstChild: false,
        isLastChild: false,
      },
    );
  } catch {
    /* native group state is best-effort */
  }
}

export function setNativeComponentStateForNode(
  handle: ShadowNodeHandle | undefined,
  state: Partial<ComponentState>,
): void {
  if (!handle || !hasNativeEngine()) return;
  const engine = getEngine();
  if (!engine) return;
  try {
    engine.Registry.setComponentStateForNode(
      handle,
      normalizeComponentState(state) ?? {
        isFocused: false,
        isActive: false,
        isDisabled: false,
        isHovered: false,
        isFirstChild: false,
        isLastChild: false,
      },
    );
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
export function useReactiveSnapshot(): RuntimeSnapshot {
  const initialSnapshot = useRef<RuntimeSnapshot | undefined>(undefined);
  if (!initialSnapshot.current) initialSnapshot.current = runtime.current;
  useEffect(() => {
    if (Platform.OS !== "web") runtime.start();
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
  onLinked?: (handle: ShadowNodeHandle | undefined) => void,
  inlineStyle?: unknown,
): (node: T | null) => void {
  const cleanup = useRef<(() => void) | undefined>(undefined);

  return useCallback(
    (node: T | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      if (node) {
        const registration = linkNode(
          node,
          className,
          componentName,
          resolved,
          snapshot,
          nativeAccents,
          componentState,
          inlineStyle,
        );
        cleanup.current = registration?.cleanup;
        onLinked?.(registration?.handle);
      } else {
        onLinked?.(undefined);
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
      onLinked,
      inlineStyle,
    ],
  );
}

export type { RNStyle };
