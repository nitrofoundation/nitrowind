import React from "react";
import { View as RNView, type ViewProps } from "react-native";
import { type PseudoStateProp } from "./pseudo";
export interface NitrowindViewProps extends ViewProps, PseudoStateProp {
    /** Tailwind class names resolved by the nitrowind engine. */
    className?: string;
}
/**
 * Drop-in replacement for RN's `View` that accepts a `className`. The initial
 * style is resolved in JS for first paint; the native engine then owns all
 * subsequent updates (no React re-render on theme/dimension changes).
 */
export declare const View: React.ForwardRefExoticComponent<NitrowindViewProps & React.RefAttributes<RNView>>;
//# sourceMappingURL=View.d.ts.map