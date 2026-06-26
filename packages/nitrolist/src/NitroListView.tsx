import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import NitroListViewNativeComponent, {
  type NitroListViewProps,
} from "./specs/NitroListViewNativeComponent";

type NitroListViewNativeProps = {
  contentContainerStyle?: StyleProp<ViewStyle>;
  handle: number;
  onViewabilityChange?: NitroListViewProps["onViewabilityChange"];
  style?: StyleProp<ViewStyle>;
};

function resolveContentInsets(style: StyleProp<ViewStyle>) {
  const flattened = StyleSheet.flatten(style);
  const paddingVertical = Number(flattened?.paddingVertical ?? 0);
  return {
    bottom: Number(flattened?.paddingBottom ?? paddingVertical),
    top: Number(flattened?.paddingTop ?? paddingVertical),
  };
}

export default function NitroListView({
  contentContainerStyle,
  handle,
  onViewabilityChange,
  style,
}: NitroListViewNativeProps) {
  const contentInsets = resolveContentInsets(contentContainerStyle);
  const flattenedStyle = StyleSheet.flatten(style);

  if (__DEV__) {
    return (
      <View style={[styles.placeholder, flattenedStyle]}>
        <Text style={styles.placeholderTitle}>NitroList renderer pending</Text>
        <Text style={styles.placeholderBody}>
          Handle {handle} is mounted, but arbitrary React templates need the
          Fabric cell renderer. The native C++ layout/range engine is active;
          rendering fake native fields or JS scroll windows is intentionally
          disabled.
        </Text>
      </View>
    );
  }

  return (
    <NitroListViewNativeComponent
      contentInsetBottom={contentInsets.bottom}
      contentInsetTop={contentInsets.top}
      handle={handle}
      onViewabilityChange={onViewabilityChange}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    backgroundColor: "#0b1020",
    borderColor: "#273044",
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    padding: 24,
  },
  placeholderBody: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 8,
    maxWidth: 360,
    textAlign: "center",
  },
  placeholderTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
  },
});
