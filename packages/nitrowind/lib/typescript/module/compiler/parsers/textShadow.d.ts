import type { VarResolver } from "../insetValue";
interface Decl {
    prop: string;
    value: string;
}
export interface TextShadowStyle {
    textShadowColor: string;
    textShadowOffset: {
        width: number;
        height: number;
    };
    textShadowRadius: number;
}
/**
 * Parse the first layer of a CSS `text-shadow` into RN's text-shadow props. RN
 * only supports a single text shadow, so any extra comma layers are dropped.
 */
export declare function extractTextShadow(declarations: ReadonlyArray<Decl>, resolveVar: VarResolver): TextShadowStyle | undefined;
/** True for declarations consumed by the text-shadow parser. */
export declare const isTextShadowProp: (prop: string) => boolean;
export {};
//# sourceMappingURL=textShadow.d.ts.map