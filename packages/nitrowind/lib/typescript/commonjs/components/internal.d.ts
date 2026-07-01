import { type Ref } from "react";
import type { RNStyle } from "../compiler/types";
import type { Accent } from "../specs/ShadowRegistry.nitro";
import type { ShadowNodeHandle } from "../specs/ShadowNodeHandle.nitro";
import { type ComponentState, type RuntimeSnapshot } from "../specs/types";
import type { GetStylesResult } from "../core/types";
/** Assign a value to either a callback ref or a mutable ref object. */
export declare function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void;
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
/**
 * Link a freshly-mounted host component to the native ShadowRegistry so the C++
 * engine owns its future style updates. Returns a cleanup (unlink) function, or
 * `undefined` when no native engine is available (fallback path).
 */
export declare function linkNode(instance: unknown, className: string, componentName: string, resolved: GetStylesResult, snapshot: RuntimeSnapshot, nativeAccents?: NativeAccentDescriptor[], componentState?: Partial<ComponentState>, inlineStyle?: unknown): LinkedNodeRegistration | undefined;
export declare function setNativeGroupStateForNode(handle: ShadowNodeHandle | undefined, state: Partial<ComponentState>): void;
export declare function setNativeComponentStateForNode(handle: ShadowNodeHandle | undefined, state: Partial<ComponentState>): void;
/**
 * Return the first-paint runtime snapshot for host style resolution. Host
 * components never subscribe to runtime dependency changes; after mount the
 * native engine owns style updates, and explicit hooks (`useTheme`,
 * `useColorScheme`, etc.) are the only JS opt-in reactivity path.
 */
export declare function useReactiveSnapshot(): RuntimeSnapshot;
/**
 * Produce a ref callback that links/unlinks the node with the native engine and
 * forwards the node to a user-provided ref.
 */
export declare function useLinkedRef<T>(className: string, componentName: string, resolved: GetStylesResult, snapshot: RuntimeSnapshot, forwardedRef: Ref<T> | undefined, nativeAccents?: NativeAccentDescriptor[], componentState?: Partial<ComponentState>, onLinked?: (handle: ShadowNodeHandle | undefined) => void, inlineStyle?: unknown): (node: T | null) => void;
export type { RNStyle };
//# sourceMappingURL=internal.d.ts.map