/**
 * nitrocss — a fully open-source, native C++ ShadowTree styling engine for
 * React Native, driven by plain-CSS class names.
 *
 * Public runtime API only — the build-time compiler lives under
 * `nitro-css/compiler` (node-only; never import it from app
 * code) and the Metro plugin under `nitro-css/metro`.
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
  NitroCssViewProps,
  NitroCssTextProps,
  NitroCssScrollViewProps,
  NitroCssFlatListProps,
  NitroCssSectionListProps,
} from "./components";

export {
  NitroCssProvider,
  useColorScheme,
  useDimensions,
  useFontScale,
  useInsets,
  useNitroCss,
  useRuntimeSnapshot,
  useTheme,
} from "./core/context";
export type { NitroCssProviderProps } from "./core/context";

export { withNativeExtending, withNitroCss } from "./hoc/withNitroCss";
export type {
  NitroCssPropMapping,
  WithNitroCssOptions,
  WithNitroCssProps,
} from "./hoc/withNitroCss";

export { cssInterop } from "./hoc/cssInterop";
export { cssInteropPresets } from "./hoc/presets";
export type { CssInteropPresetName } from "./hoc/presets";
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

export type { GetStylesResult, NitroCssContextValue } from "./core/types";
export type { RuntimeSnapshot, Dimensions, Insets } from "./specs/types";
export { ColorScheme, Orientation, StyleDependency } from "./specs/types";
export {
  nativeAccessibilityEnvironment,
  readReactNativeAccessibilitySnapshot,
  resolveAccessibilityClassName,
  useAccessibilityClassName,
  useAccessibilityEnvironment,
} from "./accessibility";
export type { AccessibilityEnvironment, AccessibilityVariant } from "./accessibility";
