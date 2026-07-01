import type { HybridObject } from "react-native-nitro-modules";
import type { FollyStyle } from "./FollyStyle.nitro";
import type { NitrowindDiagnostics } from "./NitrowindDiagnostics.nitro";
import type { ShadowNodeHandle } from "./ShadowNodeHandle.nitro";
import type { ComponentContext, ComponentState, FollyDynamic, StyleDependency } from "./types";
/**
 * An "accent" is a style applied to a sub-part of a component that isn't a
 * normal RN style prop — e.g. a TextInput's `placeholderTextColor`, or a
 * list's header/footer. Each accent links its own shadow node.
 */
export interface Accent {
    handle: ShadowNodeHandle;
    className: string;
    accentKey: string;
    dependencies: StyleDependency[];
    meta: FollyDynamic;
}
/**
 * The heart of the engine. Maps Fabric shadow nodes to their className +
 * dependencies, and commits recomputed styles straight into the ShadowTree
 * (off the JS thread, no React reconciliation).
 */
export interface ShadowRegistry extends HybridObject<{
    ios: "c++";
    android: "c++";
}> {
    /**
     * Register a shadow node with its className, dependency mask, accents and
     * inline style. The engine now owns all future style updates for this node.
     */
    link(shadowNode: ShadowNodeHandle, className: string, componentName: string, dependencies: StyleDependency[], accents: Accent[], inlineStyle: FollyStyle, state: ComponentState | undefined, dataAttributes: Record<string, string | boolean> | undefined, context: ComponentContext): void;
    /** Remove a node from the registry (on unmount). */
    unlink(shadowNode: ShadowNodeHandle): void;
    /** Temporarily pause a node (e.g. inside a suspended boundary). */
    suspend(shadowNode: ShadowNodeHandle): void;
    /**
     * Apply a batch of `tag -> style` mutations to the Fabric ShadowTree in a
     * single commit. Returns `true` if the commit succeeded.
     */
    updateShadowTree(mutations: Record<string, FollyStyle>, accentMutations: Record<string, FollyStyle>): boolean;
    /** Re-measure registered containers against the latest ShadowTree revision. */
    remeasureContainers(): void;
    /** Override one registered container's measured size after an imperative native prop update. */
    setContainerSizeForNode(shadowNode: ShadowNodeHandle, width: number, height: number): boolean;
    /** Update the native interactive state for a registered group root. */
    setGroupStateForNode(shadowNode: ShadowNodeHandle, state: ComponentState): boolean;
    /** Update one registered node's own native pseudo state. */
    setComponentStateForNode(shadowNode: ShadowNodeHandle, state: ComponentState): boolean;
    /** Attach a diagnostics instance to receive link/mutation events. */
    enableDiagnostics(instance: NitrowindDiagnostics): void;
}
//# sourceMappingURL=ShadowRegistry.nitro.d.ts.map