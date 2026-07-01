"use strict";

/**
 * nitrowind — a fully open-source, native C++ ShadowTree styling engine for
 * React Native, driven by Tailwind class names.
 *
 * Public runtime API. The build-time compiler lives under `nitrowind/compiler`
 * and the Metro plugin under `nitrowind/metro`.
 */

import "./types/react-native.js";
export { View, Text, ActivityIndicator, Image, ImageBackground, KeyboardAvoidingView, Pressable, Switch, TextInput, TouchableHighlight, TouchableOpacity, FlatList, ScrollView, SectionList } from "./components/index.js";
export { NitrowindProvider, useColorScheme, useDimensions, useFontScale, useInsets, useNitrowind, useRuntimeSnapshot, useTheme } from "./core/context.js";
export { withNativeExtending, withNitrowind } from "./hoc/withNitrowind.js";
export { registerSerializedStyles, registerStyles } from "./core/registry.js";
export { setNativeProps } from "./core/nativeProps.js";
export { runtime } from "./core/runtime.js";
export { resolveStyles } from "./core/store.js";
export { ColorScheme, Orientation, StyleDependency } from "./specs/types.js";
//# sourceMappingURL=index.js.map