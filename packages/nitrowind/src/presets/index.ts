import type { ComponentType } from "react";
import {
  cssInterop,
  type CssInteropMapping,
  type WithNitroCssProps,
} from "@nitrofoundation/nitrocss";

/**
 * A dependency-free cssInterop recipe. Presets never import the target
 * library; applications pass the component they already depend on.
 */
export interface NitroWindInteropPreset {
  readonly packageName: string;
  readonly component: string;
  readonly mapping: CssInteropMapping<Record<string, unknown>>;
}

/** Maintained mappings for commonly used React Native libraries. */
export const interopPresets = {
  gorhomBottomSheet: {
    packageName: "@gorhom/bottom-sheet",
    component: "BottomSheet",
    mapping: {
      className: "style",
      backgroundClassName: "backgroundStyle",
      containerClassName: "containerStyle",
      handleClassName: "handleStyle",
    },
  },
  gorhomBottomSheetView: {
    packageName: "@gorhom/bottom-sheet",
    component: "BottomSheetView",
    mapping: {
      className: "style",
    },
  },
  shopifyFlashList: {
    packageName: "@shopify/flash-list",
    component: "FlashList",
    mapping: {
      className: "style",
      contentContainerClassName: "contentContainerStyle",
    },
  },
  expoImage: {
    packageName: "expo-image",
    component: "Image",
    mapping: {
      className: "style",
    },
  },
  gestureHandlerScrollView: {
    packageName: "react-native-gesture-handler",
    component: "ScrollView",
    mapping: {
      className: "style",
      contentContainerClassName: "contentContainerStyle",
    },
  },
  gestureHandlerFlatList: {
    packageName: "react-native-gesture-handler",
    component: "FlatList",
    mapping: {
      className: "style",
      contentContainerClassName: "contentContainerStyle",
    },
  },
} as const satisfies Record<string, NitroWindInteropPreset>;

export type NitroWindInteropPresetName = keyof typeof interopPresets;

export interface NitroWindPresetClassNameProps extends WithNitroCssProps {
  backgroundClassName?: string;
  containerClassName?: string;
  contentContainerClassName?: string;
  handleClassName?: string;
}

/** Apply a built-in preset to a component supplied by the application. */
export function withInteropPreset<P extends object>(
  Component: ComponentType<P>,
  preset: NitroWindInteropPresetName | NitroWindInteropPreset,
): ComponentType<P & NitroWindPresetClassNameProps> {
  const selected =
    typeof preset === "string" ? interopPresets[preset] : preset;
  return cssInterop(
    Component,
    selected.mapping as CssInteropMapping<P>,
    selected.component,
  ) as ComponentType<P & NitroWindPresetClassNameProps>;
}
