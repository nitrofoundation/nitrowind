import { type VarResolver } from "./insetValue";
import type { CompiledArtifact } from "./types";
/** The two axes a container query can read. */
export type ContainerAxis = "width" | "height";
/** Comparison operators supported by both Tailwind-native and custom syntax. */
export type ContainerOp = ">" | "<" | ">=" | "<=";
/**
 * A resolved container-query condition. Thresholds are baked to px at compile
 * time so the native engine only needs a numeric comparison against the live
 * container size — no unit math, no React re-render.
 */
export interface ContainerCondition {
    /** Named container to match (`@container/sidebar`), or the nearest one. */
    name?: string;
    axis: ContainerAxis;
    op: ContainerOp;
    /** Threshold in px. */
    value: number;
}
/** This class turns its node into a queryable container. */
export interface ContainerMarker {
    /** Optional container name (`@container/sidebar`). */
    name?: string;
    /** `inline-size` (width only) or `size` (width + height). */
    type: "inline-size" | "size";
}
/** CSS declarations that mark a container; never emitted as RN styles. */
export declare const CONTAINER_DECL_PROPS: Set<string>;
/**
 * Parse a `@container` at-rule prelude into a {@link ContainerCondition}.
 * Handles both the range form Tailwind v4 emits (`@container (width >= 230px)`,
 * named `@container sidebar (width < 400px)`) and the `min-width`/`max-width`
 * form. Returns `undefined` for an unrecognized prelude.
 */
export declare function parseContainerQuery(prelude: string, rem: number, resolveVar?: VarResolver): ContainerCondition | undefined;
/**
 * Detect whether a rule's declarations mark its node as a container, returning
 * the marker (name + type) or `undefined`. Handles the `container-type` /
 * `container-name` longhands and the `container: <name> / <type>` shorthand
 * lightningcss may emit.
 */
export declare function containerMarkerFromDeclarations(declarations: ReadonlyArray<{
    prop: string;
    value: string;
}>): ContainerMarker | undefined;
/** A custom container token parsed into its condition + the base utility. */
export interface CustomContainerToken {
    /** The original class token (key under which the bucket is stored). */
    token: string;
    condition: ContainerCondition;
    /** The Tailwind utility to apply when the condition holds (e.g. `hidden`). */
    baseUtility: string;
}
/**
 * Parse the custom container syntax `[cq-w>230px]:hidden` (or the legacy
 * `[parent-w>230px]:hidden`) and the height axis `[cq-h<400px]:flex`, optional
 * named container `[cq-w>=230px]/sidebar:gap-2`. Returns `undefined` if the
 * token is not a custom container token.
 */
export declare function parseCustomContainerToken(token: string, rem: number, resolveVar?: VarResolver): CustomContainerToken | undefined;
/** Whether a token uses the custom container syntax. */
export declare const isCustomContainerToken: (token: string) => boolean;
/**
 * Materialize custom container tokens (`[cq-w>230px]:hidden`) into the
 * artifact. Each token clones the compiled style of its base utility (e.g.
 * `hidden`) into a new bucket gated by the parsed container condition and
 * carrying the `ContainerSize` dependency. Tokens whose base utility wasn't
 * compiled (not used elsewhere / unknown) are skipped.
 *
 * Run after `parseStyles`, with the candidate list from the source scan.
 */
export declare function applyCustomContainerTokens(artifact: CompiledArtifact, tokens: ReadonlyArray<string>, rem: number, resolveVar?: VarResolver): void;
//# sourceMappingURL=container.d.ts.map