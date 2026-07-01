import React from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
export declare function calculateGridContentWidth({ containerWidth, parentClassName, parentStyle, }: {
    containerWidth: number;
    parentClassName: string;
    parentStyle?: StyleProp<ViewStyle>;
}): number;
export declare function calculateGridFallbackWidth({ containerWidth, columns, gap, span, }: {
    containerWidth: number;
    columns: number;
    gap: number;
    span: number;
}): number;
export declare function withGridFallback(children: React.ReactNode, parentClassName: string, containerWidth?: number): React.ReactNode;
export declare function useGridFallback(children: React.ReactNode, parentClassName: string, onLayout?: (event: LayoutChangeEvent) => void, parentStyle?: StyleProp<ViewStyle>): {
    children: React.ReactNode;
    onLayout?: (event: LayoutChangeEvent) => void;
};
//# sourceMappingURL=grid.d.ts.map