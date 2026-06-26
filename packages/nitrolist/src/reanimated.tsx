import React, { useMemo } from "react";
import {
  StyleSheet,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import type { ViewabilityState } from "./hooks";
import NitroListViewNativeComponent, {
  type NitroListViewabilityChangeEvent,
  type NitroListViewProps,
} from "./specs/NitroListViewNativeComponent";

type SharedValue<TValue> = {
  value: TValue;
};

type AnimatedModule = {
  createAnimatedComponent?: <TProps extends object>(
    component: React.ComponentType<TProps>,
  ) => React.ComponentType<TProps>;
  useEvent?: <TEvent extends object>(
    handler: (event: TEvent) => void,
    eventNames?: string[],
    rebuild?: unknown,
  ) => unknown;
  runOnJS?: <TArgs extends unknown[]>(
    fn: (...args: TArgs) => void,
  ) => (...args: TArgs) => void;
};

export type NitroListViewabilityWorklet = (
  viewability: ViewabilityState,
) => void;

export type NitroReanimatedListViewProps = {
  contentContainerStyle?: StyleProp<ViewStyle>;
  handle: number;
  onViewabilityChange?: NitroListViewProps["onViewabilityChange"];
  onViewabilityChangeWorklet?: NitroListViewabilityWorklet;
  style?: StyleProp<ViewStyle>;
  viewability?: SharedValue<ViewabilityState>;
};

function resolveContentInsets(style: StyleProp<ViewStyle>) {
  const flattened = StyleSheet.flatten(style);
  const paddingVertical = Number(flattened?.paddingVertical ?? 0);
  return {
    bottom: Number(flattened?.paddingBottom ?? paddingVertical),
    top: Number(flattened?.paddingTop ?? paddingVertical),
  };
}

let cachedReanimated: AnimatedModule | null | undefined;
let cachedAnimatedListView:
  | React.ComponentType<NitroListViewProps>
  | null
  | undefined;

function loadReanimated(): AnimatedModule | null {
  if (cachedReanimated !== undefined) {
    return cachedReanimated;
  }

  try {
    const mod = require("react-native-reanimated") as AnimatedModule & {
      default?: AnimatedModule;
    };
    cachedReanimated = mod.default ?? mod;
  } catch {
    cachedReanimated = null;
  }

  return cachedReanimated;
}

function getAnimatedListView(): React.ComponentType<NitroListViewProps> {
  if (cachedAnimatedListView !== undefined) {
    return cachedAnimatedListView ?? NitroListViewNativeComponent;
  }

  const reanimated = loadReanimated();
  cachedAnimatedListView =
    reanimated?.createAnimatedComponent?.(NitroListViewNativeComponent) ?? null;
  return cachedAnimatedListView ?? NitroListViewNativeComponent;
}

function toViewabilityState(
  event: NitroListViewabilityChangeEvent,
): ViewabilityState {
  "worklet";
  return {
    firstVisibleIndex: event.firstVisibleIndex,
    lastVisibleIndex: event.lastVisibleIndex,
    visibleIndices: event.visibleIndices,
    renderedIndices: event.renderedIndices,
    outsideViewportIndices: event.outsideViewportIndices,
    visibleIds: event.visibleIds,
    renderedIds: event.renderedIds,
    outsideViewportIds: event.outsideViewportIds,
  };
}

export function useNitroListReanimatedViewability({
  onViewabilityChange,
  onViewabilityChangeWorklet,
  viewability,
}: {
  onViewabilityChange?: NitroListViewProps["onViewabilityChange"];
  onViewabilityChangeWorklet?: NitroListViewabilityWorklet;
  viewability?: SharedValue<ViewabilityState>;
}): NitroListViewProps["onViewabilityChange"] | undefined {
  const reanimated = loadReanimated();

  return useMemo(() => {
    if (reanimated?.useEvent == null) {
      return undefined;
    }
    const runOnJS = reanimated.runOnJS;

    return reanimated.useEvent<NitroListViewabilityChangeEvent>(
      (event) => {
        "worklet";
        const next = toViewabilityState(event);
        if (viewability != null) {
          viewability.value = next;
        }
        onViewabilityChangeWorklet?.(next);
        if (onViewabilityChange != null && runOnJS != null) {
          runOnJS(onViewabilityChange)({
            nativeEvent: next,
          } as NativeSyntheticEvent<ViewabilityState>);
        }
      },
      ["topViewabilityChange", "onViewabilityChange"],
      [onViewabilityChange, onViewabilityChangeWorklet, runOnJS, viewability],
    ) as NitroListViewProps["onViewabilityChange"];
  }, [
    onViewabilityChange,
    onViewabilityChangeWorklet,
    reanimated,
    viewability,
  ]);
}

export function NitroReanimatedListView({
  contentContainerStyle,
  handle,
  onViewabilityChange,
  onViewabilityChangeWorklet,
  style,
  viewability,
}: NitroReanimatedListViewProps) {
  const AnimatedListView = getAnimatedListView();
  const contentInsets = resolveContentInsets(contentContainerStyle);
  const animatedViewabilityHandler = useNitroListReanimatedViewability({
    onViewabilityChange,
    onViewabilityChangeWorklet,
    viewability,
  });

  return (
    <AnimatedListView
      contentInsetBottom={contentInsets.bottom}
      contentInsetTop={contentInsets.top}
      handle={handle}
      onViewabilityChange={animatedViewabilityHandler ?? onViewabilityChange}
      style={style}
    />
  );
}

export default NitroReanimatedListView;
