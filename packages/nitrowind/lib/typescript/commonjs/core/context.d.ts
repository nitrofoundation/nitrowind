import React, { type ReactNode } from "react";
import { StyleDependency, type Dimensions, type Insets } from "../specs/types";
import type { NitrowindContextValue } from "./types";
export interface NitrowindProviderProps {
    children: ReactNode;
}
/**
 * Provides reactive access to the runtime snapshot and theme controls. Wrap
 * your app root with this once.
 */
export declare function NitrowindProvider({ children, }: NitrowindProviderProps): React.JSX.Element;
export declare function useRuntimeSnapshot(dependencies?: StyleDependency[]): import("..").RuntimeSnapshot;
/** Access the current runtime snapshot and theme controls. */
export declare function useNitrowind(): NitrowindContextValue;
export declare function useColorScheme(): import("..").ColorScheme;
export declare function useTheme(): {
    themeName: string;
    setTheme: (name: string) => void;
};
export declare function useDimensions(): Dimensions;
export declare function useInsets(): Insets;
export declare function useFontScale(): number;
//# sourceMappingURL=context.d.ts.map