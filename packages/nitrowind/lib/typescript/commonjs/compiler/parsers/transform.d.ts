import { type VarResolver } from "../insetValue";
/**
 * RN `transform`-array axis keys, in the canonical order the engine emits them.
 * The compiler pulls each axis out of Tailwind's per-axis `--tw-*` helpers and
 * the `rotate`/`scale`/`translate`/`transform` longhands, storing them as
 * individual style props. They are folded back into a single `transform` array
 * at resolve time (see `core/normalize`), which makes multi-class composition
 * merge correctly: the same axis overrides last-wins, different axes union.
 */
export declare const TRANSFORM_AXES: readonly ["perspective", "translateX", "translateY", "rotate", "rotateX", "rotateY", "rotateZ", "skewX", "skewY", "scaleX", "scaleY"];
export type TransformAxis = (typeof TRANSFORM_AXES)[number];
interface Decl {
    prop: string;
    value: string;
}
/**
 * True for any declaration consumed by the transform parser. None of these is a
 * valid stand-alone RN style prop, so the main parser skips them.
 */
export declare const isTransformProp: (prop: string) => boolean;
/**
 * Pull the individual transform components out of one rule's declarations.
 * Returns an axis → value map, e.g. `{ rotate: "45deg", translateX: 16,
 * scaleX: 1.1 }`. Only axes the rule explicitly sets are emitted, so composing
 * `scale-x-50` with `scale-y-150` keeps both axes instead of clobbering one.
 */
export declare function extractTransform(declarations: ReadonlyArray<Decl>, resolveVar: VarResolver, rem: number): Record<string, string | number>;
export {};
//# sourceMappingURL=transform.d.ts.map