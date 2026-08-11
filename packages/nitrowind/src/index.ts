/**
 * nitrowind — the Tailwind bindings for React Native, as a
 * thin wrapper around `nitrocss` (the CSS-to-native-style
 * compiler + C++ ShadowTree engine).
 *
 * Re-exports the entire nitrocss runtime surface and keeps the historical
 * `Nitrowind*` names as aliases so existing apps keep compiling.
 */
export * from "@nitrofoundation/nitrocss";

// Back-compat aliases for the pre-split `nitrowind` API.
export {
  NitroCssProvider as NitrowindProvider,
  useNitroCss as useNitrowind,
  withNitroCss as withNitrowind,
} from "@nitrofoundation/nitrocss";

export type {
  NitroCssViewProps as NitrowindViewProps,
  NitroCssTextProps as NitrowindTextProps,
  NitroCssScrollViewProps as NitrowindScrollViewProps,
  NitroCssFlatListProps as NitrowindFlatListProps,
  NitroCssSectionListProps as NitrowindSectionListProps,
  NitroCssProviderProps as NitrowindProviderProps,
  NitroCssPropMapping as NitrowindPropMapping,
  WithNitroCssOptions as WithNitrowindOptions,
  WithNitroCssProps as WithNitrowindProps,
  NitroCssContextValue as NitrowindContextValue,
} from "@nitrofoundation/nitrocss";

export {
  interopPresets,
  withInteropPreset,
} from "./presets";
export type {
  NitroWindInteropPreset,
  NitroWindInteropPresetName,
  NitroWindPresetClassNameProps,
} from "./presets";
