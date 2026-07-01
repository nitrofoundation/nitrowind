import React from "react";
import { Text as RNText, type TextProps } from "react-native";
import { type PseudoStateProp } from "./pseudo";
export interface NitrowindTextProps extends TextProps, PseudoStateProp {
    /** Tailwind class names resolved by the nitrowind engine. */
    className?: string;
}
/**
 * Drop-in replacement for RN's `Text` that accepts a `className`. Behaves like
 * {@link View}: JS resolves the first paint, the native engine owns updates.
 */
export declare const Text: React.ForwardRefExoticComponent<NitrowindTextProps & React.RefAttributes<RNText>>;
//# sourceMappingURL=Text.d.ts.map