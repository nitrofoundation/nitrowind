"use strict";

/**
 * Drop-in styled wrappers for the common React Native host components. Each is
 * produced by {@link withNitrowind}, so it accepts a `className`, resolves the
 * first paint in JS, and then hands all subsequent style updates to the native
 * engine (no React re-render on theme / colorScheme / dimension / inset change).
 *
 * Scrollable containers (`ScrollView`, `FlatList`, `SectionList`) live in
 * `./scrollables` because they additionally support `contentContainerClassName`.
 */
import { ActivityIndicator as RNActivityIndicator, Image as RNImage, ImageBackground as RNImageBackground, KeyboardAvoidingView as RNKeyboardAvoidingView, Pressable as RNPressable, Switch as RNSwitch, TextInput as RNTextInput, TouchableHighlight as RNTouchableHighlight, TouchableOpacity as RNTouchableOpacity } from "react-native";
import { withNitrowind } from "../hoc/withNitrowind.js";

/** RN `Pressable` driven by `className` (callback `style` is preserved). */
export const Pressable = withNitrowind(RNPressable, "Pressable");

/** RN `Image` driven by `className`. */
export const Image = withNitrowind(RNImage, "Image", {
  nativeColorProps: {
    fillClassName: "tintColor",
    tintColorClassName: "tintColor"
  }
});

/** RN `ImageBackground` driven by `className` (styles the container). */
export const ImageBackground = withNitrowind(RNImageBackground, "ImageBackground", {
  nativeColorProps: {
    fillClassName: "tintColor",
    tintColorClassName: "tintColor"
  }
});

/** RN `TextInput` driven by `className`. */
export const TextInput = withNitrowind(RNTextInput, "TextInput", {
  nativeColorProps: {
    cursorColorClassName: "cursorColor",
    placeholderTextColorClassName: "placeholderTextColor",
    selectionColorClassName: "selectionColor",
    selectionHandleColorClassName: "selectionHandleColor",
    underlineColorAndroidClassName: "underlineColorAndroid"
  }
});

/** RN `TouchableOpacity` driven by `className`. */
export const TouchableOpacity = withNitrowind(RNTouchableOpacity, "TouchableOpacity");

/** RN `TouchableHighlight` driven by `className`. */
export const TouchableHighlight = withNitrowind(RNTouchableHighlight, "TouchableHighlight");

/** RN `Switch` driven by `className`. */
export const Switch = withNitrowind(RNSwitch, "Switch", {
  nativeColorProps: {
    thumbColorClassName: "thumbColor",
    trackColorFalseClassName: "trackColorFalse",
    trackColorTrueClassName: "trackColorTrue"
  }
});

/** RN `ActivityIndicator` driven by `className`. */
export const ActivityIndicator = withNitrowind(RNActivityIndicator, "ActivityIndicator", {
  nativeColorProps: {
    colorClassName: "color",
    tintColorClassName: "color"
  }
});

/** RN `KeyboardAvoidingView` driven by `className`. */
export const KeyboardAvoidingView = withNitrowind(RNKeyboardAvoidingView, "KeyboardAvoidingView");
//# sourceMappingURL=styled.js.map