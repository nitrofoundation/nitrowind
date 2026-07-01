import type { LayoutChangeEvent } from "react-native";
import type { RNStyle } from "../compiler/types";
import type { GetStylesResult } from "../core/types";
interface ContainerContextValue {
    /** Nearest enclosing container's id (for unnamed `@container` queries). */
    nearestId?: string;
    /** Named container → id, accumulated down the tree. */
    named: Record<string, string>;
}
export declare const ContainerProvider: import("react").Provider<ContainerContextValue>;
export interface UseContainerResult {
    /**
     * `onLayout` to attach to the host: the container size reporter (JS fallback)
     * already merged with the consumer's own `onLayout`. `undefined` when neither
     * is needed.
     */
    onLayout?: (event: LayoutChangeEvent) => void;
    /** Extra style from currently-matching container queries (JS path). */
    containerStyle?: RNStyle;
    /** Context to provide to descendants when this node is a container. */
    provider?: ContainerContextValue;
}
/**
 * Wire container-query behavior for a nitrowind component:
 *
 * - When the className marks a container (`@container` / `@container/name`),
 *   register it, report its measured size via `onLayout`, and provide a context
 *   so descendant queries can resolve it.
 * - When the className has container queries (`@min-[230px]:…`,
 *   `[parent-w>230px]:…`), subscribe to the targeted container's size and return
 *   the merged style of the conditions that currently match.
 *
 * When the native engine is present the C++ `LayoutObserver` reads container
 * sizes straight off the shadow tree post-layout and commits the gated styles
 * with no re-render, so the JS measurement below is skipped entirely. The JS
 * path is the fallback only (web, Expo Go, tests, or before the native module is
 * linked), where it reports size via `onLayout` and re-renders on change.
 */
export declare function useContainer(resolved: GetStylesResult, userOnLayout?: (event: LayoutChangeEvent) => void): UseContainerResult;
export {};
//# sourceMappingURL=containerContext.d.ts.map