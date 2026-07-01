import { type ComponentType, type Ref } from "react";
import type { StyleProp } from "react-native";
import type { RNStyle } from "../compiler/types";
import { type PseudoStateProp } from "../components/pseudo";
export interface WithNitrowindProps {
    className?: string;
    style?: StyleProp<unknown>;
}
export interface NitrowindPropMapping {
    fromClassName: string;
    styleProperty?: keyof RNStyle;
    nativeProp?: string;
}
export type WithNitrowindPropOptions<P> = Partial<Record<keyof P & string, NitrowindPropMapping>>;
export interface WithNitrowindAdvancedOptions<P> {
    props?: Partial<Record<keyof P & string, NitrowindPropMapping>>;
    nativeColorProps?: Record<string, string>;
}
export type WithNitrowindOptions<P> = WithNitrowindPropOptions<P> | WithNitrowindAdvancedOptions<P>;
/**
 * Wrap any component that accepts a `style` prop so it understands `className`.
 * Use this for third-party components (e.g. `Pressable`, `Image`, custom views)
 * that you want to drive with nitrowind classes.
 */
export declare function withNitrowind<P extends {
    style?: StyleProp<unknown>;
}>(Component: ComponentType<P>, componentName?: string, options?: WithNitrowindOptions<P>): ComponentType<P & WithNitrowindProps & PseudoStateProp & {
    ref?: Ref<unknown>;
}>;
/**
 * Native-first variant of `withNitrowind` for third-party host components.
 *
 * JS registers className/prop mapping metadata; when the native engine is
 * present, C++ resolves and commits the mapped props/styles directly.
 */
export declare function withNativeExtending<P extends object>(Component: ComponentType<P>, componentName?: string, options?: WithNitrowindOptions<P>): ComponentType<P & WithNitrowindProps & PseudoStateProp & {
    ref?: Ref<unknown>;
}>;
//# sourceMappingURL=withNitrowind.d.ts.map