import type { CssInteropShorthandMapping } from "./cssInterop";
import type { WithNitroCssOptions } from "./withNitroCss";

/** Common third-party component prop layouts. No peer dependency is required. */
export const cssInteropPresets = {
  safeArea: {
    className: "style",
  },
  scrollable: {
    className: "style",
    contentContainerClassName: "contentContainerStyle",
  },
  bottomSheet: {
    className: "style",
    backgroundClassName: "backgroundStyle",
    handleClassName: "handleStyle",
    contentContainerClassName: "contentContainerStyle",
  },
  icon: {
    props: {
      color: { fromClassName: "colorClassName", styleProperty: "color" },
    },
  },
  navigation: {
    className: "style",
    contentClassName: "contentStyle",
    headerClassName: "headerStyle",
  },
} as const satisfies Record<
  string,
  CssInteropShorthandMapping | WithNitroCssOptions<Record<string, unknown>>
>;

export type CssInteropPresetName = keyof typeof cssInteropPresets;
