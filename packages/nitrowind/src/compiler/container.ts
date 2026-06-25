import { lengthToPx, type VarResolver } from "./insetValue";
import { flag } from "./dependencies";
import { StyleDependency } from "../specs/types";
import type { CompiledArtifact, CompiledClass } from "./types";

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
export const CONTAINER_DECL_PROPS = new Set([
  "container",
  "container-type",
  "container-name",
]);

const noResolve: VarResolver = () => undefined;

const RANGE_RE =
  /(width|height|inline-size|block-size)\s*(>=|<=|>|<)\s*(-?[\d.]+(?:px|rem|em)?)/i;
const MINMAX_RE =
  /(min|max)-(width|height|inline-size|block-size)\s*:\s*(-?[\d.]+(?:px|rem|em)?)/i;

const toAxis = (raw: string): ContainerAxis =>
  raw === "height" || raw === "block-size" ? "height" : "width";

/**
 * Parse a `@container` at-rule prelude into a {@link ContainerCondition}.
 * Handles both the range form Tailwind v4 emits (`@container (width >= 230px)`,
 * named `@container sidebar (width < 400px)`) and the `min-width`/`max-width`
 * form. Returns `undefined` for an unrecognized prelude.
 */
export function parseContainerQuery(
  prelude: string,
  rem: number,
  resolveVar: VarResolver = noResolve,
): ContainerCondition | undefined {
  const body = prelude.replace(/^@container\s*/i, "");
  const parenIdx = body.indexOf("(");
  if (parenIdx === -1) return undefined;

  const name = body.slice(0, parenIdx).trim() || undefined;
  const inner = body.slice(parenIdx + 1, body.lastIndexOf(")"));

  const range = RANGE_RE.exec(inner);
  if (range) {
    const value = lengthToPx(range[3]!, resolveVar, rem);
    if (value === undefined) return undefined;
    return {
      ...(name ? { name } : {}),
      axis: toAxis(range[1]!.toLowerCase()),
      op: range[2] as ContainerOp,
      value,
    };
  }

  const minmax = MINMAX_RE.exec(inner);
  if (minmax) {
    const value = lengthToPx(minmax[3]!, resolveVar, rem);
    if (value === undefined) return undefined;
    const op: ContainerOp = minmax[1]!.toLowerCase() === "min" ? ">=" : "<=";
    return {
      ...(name ? { name } : {}),
      axis: toAxis(minmax[2]!.toLowerCase()),
      op,
      value,
    };
  }

  return undefined;
}

/**
 * Detect whether a rule's declarations mark its node as a container, returning
 * the marker (name + type) or `undefined`. Handles the `container-type` /
 * `container-name` longhands and the `container: <name> / <type>` shorthand
 * lightningcss may emit.
 */
export function containerMarkerFromDeclarations(
  declarations: ReadonlyArray<{ prop: string; value: string }>,
): ContainerMarker | undefined {
  let type: ContainerMarker["type"] | undefined;
  let name: string | undefined;

  for (const { prop, value } of declarations) {
    if (prop === "container-type") {
      type = value.trim() === "size" ? "size" : "inline-size";
    } else if (prop === "container-name") {
      const n = value.trim();
      if (n && n !== "none") name = n;
    } else if (prop === "container") {
      // Shorthand: `container: <name> / <type>` or just `<type>`.
      const [namePart, typePart] = value.split("/").map((s) => s.trim());
      if (typePart) type = typePart === "size" ? "size" : "inline-size";
      if (namePart && namePart !== "none") {
        if (typePart) name = namePart;
        else if (namePart === "inline-size" || namePart === "size")
          type = namePart;
        else name = namePart;
      }
      type ??= "inline-size";
    }
  }

  if (!type && name === undefined) return undefined;
  return { ...(name ? { name } : {}), type: type ?? "inline-size" };
}

const CUSTOM_TOKEN_RE =
  /^\[(?:parent|cq)-([wh])(>=|<=|>|<)(-?[\d.]+(?:px|rem|em)?)\](?:\/([a-zA-Z][\w-]*))?:(.+)$/;

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
export function parseCustomContainerToken(
  token: string,
  rem: number,
  resolveVar: VarResolver = noResolve,
): CustomContainerToken | undefined {
  const m = CUSTOM_TOKEN_RE.exec(token);
  if (!m) return undefined;
  const value = lengthToPx(m[3]!, resolveVar, rem);
  if (value === undefined) return undefined;
  const name = m[4];
  return {
    token,
    condition: {
      ...(name ? { name } : {}),
      axis: m[1] === "h" ? "height" : "width",
      op: m[2] as ContainerOp,
      value,
    },
    baseUtility: m[5]!,
  };
}

/** Whether a token uses the custom container syntax. */
export const isCustomContainerToken = (token: string): boolean =>
  CUSTOM_TOKEN_RE.test(token);

/**
 * Materialize custom container tokens (`[cq-w>230px]:hidden`) into the
 * artifact. Each token clones the compiled style of its base utility (e.g.
 * `hidden`) into a new bucket gated by the parsed container condition and
 * carrying the `ContainerSize` dependency. Tokens whose base utility wasn't
 * compiled (not used elsewhere / unknown) are skipped.
 *
 * Run after `parseStyles`, with the candidate list from the source scan.
 */
export function applyCustomContainerTokens(
  artifact: CompiledArtifact,
  tokens: ReadonlyArray<string>,
  rem: number,
  resolveVar: VarResolver = noResolve,
): void {
  for (const token of tokens) {
    const parsed = parseCustomContainerToken(token, rem, resolveVar);
    if (!parsed) continue;
    const baseBuckets = artifact.classes[parsed.baseUtility];
    if (!baseBuckets || baseBuckets.length === 0) continue;
    // Clone the unconditional base bucket (no variant/platform/container gate).
    const base =
      baseBuckets.find(
        (b) =>
          b.variant === "base" &&
          !b.platform &&
          !b.container &&
          !b.containerMarker,
      ) ?? baseBuckets[0]!;
    const bucket: CompiledClass = {
      style: { ...base.style },
      dependencies: base.dependencies | flag(StyleDependency.ContainerSize),
      variant: "base",
      container: parsed.condition,
    };
    (artifact.classes[parsed.token] ??= []).push(bucket);
  }
}
