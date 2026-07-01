"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TouchableOpacity = exports.TouchableHighlight = exports.TextInput = exports.Switch = exports.Pressable = exports.KeyboardAvoidingView = exports.ImageBackground = exports.Image = exports.ActivityIndicator = void 0;
var _reactNative = require("react-native");
var _withNitrowind = require("../hoc/withNitrowind.js");
/**
 * Drop-in styled wrappers for the common React Native host components. Each is
 * produced by {@link withNitrowind}, so it accepts a `className`, resolves the
 * first paint in JS, and then hands all subsequent style updates to the native
 * engine (no React re-render on theme / colorScheme / dimension / inset change).
 *
 * Scrollable containers (`ScrollView`, `FlatList`, `SectionList`) live in
 * `./scrollables` because they additionally support `contentContainerClassName`.
 */

/** RN `Pressable` driven by `className` (callback `style` is preserved). */
const Pressable = exports.Pressable = (0, _withNitrowind.withNitrowind)(_reactNative.Pressable, "Pressable");

/** RN `Image` driven by `className`. */
const Image = exports.Image = (0, _withNitrowind.withNitrowind)(_reactNative.Image, "Image", {
  nativeColorProps: {
    fillClassName: "tintColor",
    tintColorClassName: "tintColor"
  }
});

/** RN `ImageBackground` driven by `className` (styles the container). */
const ImageBackground = exports.ImageBackground = (0, _withNitrowind.withNitrowind)(_reactNative.ImageBackground, "ImageBackground", {
  nativeColorProps: {
    fillClassName: "tintColor",
    tintColorClassName: "tintColor"
  }
});

/** RN `TextInput` driven by `className`. */
const TextInput = exports.TextInput = (0, _withNitrowind.withNitrowind)(_reactNative.TextInput, "TextInput", {
  nativeColorProps: {
    cursorColorClassName: "cursorColor",
    placeholderTextColorClassName: "placeholderTextColor",
    selectionColorClassName: "selectionColor",
    selectionHandleColorClassName: "selectionHandleColor",
    underlineColorAndroidClassName: "underlineColorAndroid"
  }
});

/** RN `TouchableOpacity` driven by `className`. */
const TouchableOpacity = exports.TouchableOpacity = (0, _withNitrowind.withNitrowind)(_reactNative.TouchableOpacity, "TouchableOpacity");

/** RN `TouchableHighlight` driven by `className`. */
const TouchableHighlight = exports.TouchableHighlight = (0, _withNitrowind.withNitrowind)(_reactNative.TouchableHighlight, "TouchableHighlight");

/** RN `Switch` driven by `className`. */
const Switch = exports.Switch = (0, _withNitrowind.withNitrowind)(_reactNative.Switch, "Switch", {
  nativeColorProps: {
    thumbColorClassName: "thumbColor",
    trackColorFalseClassName: "trackColorFalse",
    trackColorTrueClassName: "trackColorTrue"
  }
});

/** RN `ActivityIndicator` driven by `className`. */
const ActivityIndicator = exports.ActivityIndicator = (0, _withNitrowind.withNitrowind)(_reactNative.ActivityIndicator, "ActivityIndicator", {
  nativeColorProps: {
    colorClassName: "color",
    tintColorClassName: "color"
  }
});

/** RN `KeyboardAvoidingView` driven by `className`. */
const KeyboardAvoidingView = exports.KeyboardAvoidingView = (0, _withNitrowind.withNitrowind)(_reactNative.KeyboardAvoidingView, "KeyboardAvoidingView");
//# sourceMappingURL=styled.js.map