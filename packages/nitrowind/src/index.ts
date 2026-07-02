/**
 * nitrowind — a fully open-source, native C++ ShadowTree styling engine for
 * React Native, driven by Tailwind class names.
 *
 * Public runtime API. `nitrowind/compiler` is a compatibility re-export of
 * `nitrocss/compiler`; the Metro plugin lives under `nitrowind/metro`.
 */

import "./types/react-native";

export {
  View,
  Text,
  ActivityIndicator,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Pressable,
  Switch,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  FlatList,
  ScrollView,
  SectionList,
} from "./components";
export type {
  NitrowindViewProps,
  NitrowindTextProps,
  NitrowindScrollViewProps,
  NitrowindFlatListProps,
  NitrowindSectionListProps,
} from "./components";

export {
  NitrowindProvider,
  useColorScheme,
  useDimensions,
  useFontScale,
  useInsets,
  useNitrowind,
  useRuntimeSnapshot,
  useTheme,
} from "./core/context";
export type { NitrowindProviderProps } from "./core/context";

export { withNativeExtending, withNitrowind } from "./hoc/withNitrowind";
export type {
  NitrowindPropMapping,
  WithNitrowindOptions,
  WithNitrowindProps,
} from "./hoc/withNitrowind";

export { cssInterop } from "./hoc/cssInterop";
export type {
  CssInteropComponent,
  CssInteropMapping,
  CssInteropShorthandMapping,
} from "./hoc/cssInterop";

export { registerSerializedStyles, registerStyles } from "./core/registry";
export { setNativeProps } from "./core/nativeProps";
export type { NativeProps } from "./core/nativeProps";
export { runtime } from "./core/runtime";
export { resolveStyles, resolveStylesForPlatform } from "./core/store";

export type { GetStylesResult, NitrowindContextValue } from "./core/types";
export type { RuntimeSnapshot, Dimensions, Insets } from "./specs/types";
export { ColorScheme, Orientation, StyleDependency } from "./specs/types";
