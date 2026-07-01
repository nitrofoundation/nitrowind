import type { RNStyle } from "../compiler/types";
export interface NativeProps {
    style?: RNStyle;
    [key: string]: unknown;
}
export declare function setNativeProps(ref: unknown, props: NativeProps): boolean;
//# sourceMappingURL=nativeProps.d.ts.map