import { useCallback, useMemo } from 'react';
import { useHandle, useTemplate, type ViewabilityState } from 'nitrolist';
import { NitroReanimatedListView } from 'nitrolist/reanimated';
import { Text, TextInput, View } from 'nitrowind';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const VIEWABILITY_CONFIG = {
  fallbackIndex: 0,
  overscanAfter: 3,
  overscanBefore: 3,
  windowSize: 7,
} as const;

const EMPTY_VIEWABILITY: ViewabilityState = {
  firstVisibleIndex: 0,
  lastVisibleIndex: 0,
  visibleIndices: [],
  renderedIndices: [],
  outsideViewportIndices: [],
  visibleIds: [],
  renderedIds: [],
  outsideViewportIds: [],
};

type ReanimatedItem = {
  id: string;
  template: 'message' | 'alert';
  props: {
    text: string;
  };
};

type RowProps = {
  id: string;
  text?: string;
};

const ITEMS: ReanimatedItem[] = Array.from({ length: 500 }, (_, index) => {
  const id = String(index + 1);
  const alert = index % 6 === 0;
  return {
    id,
    template: alert ? 'alert' : 'message',
    props: {
      text: alert
        ? `Reanimated alert ${id}: native viewability is mirrored into a shared value while the regular JS callback still updates screen state.`
        : `Reanimated row ${id}: this item has multiline text so auto-height, native recycling, and worklet viewability can be checked while scrolling.`,
    },
  };
});

function MessageRow({ id, text }: RowProps) {
  return (
    <View className="mx-3 my-1.5 rounded-xl border border-border bg-surface-elevated px-3 py-3">
      <Text className="text-sm font-extrabold text-on-surface">#{id}</Text>
      <Text className="mt-2 text-base text-on-surface">{text}</Text>
    </View>
  );
}

function AlertRow({ id, text }: RowProps) {
  return (
    <View className="mx-3 my-1.5 rounded-xl border border-primary bg-surface-elevated px-3 py-3">
      <Text className="text-sm font-extrabold text-primary">#{id} worklet</Text>
      <Text className="mt-2 text-base text-on-surface">{text}</Text>
    </View>
  );
}

const TEMPLATES = {
  alert: AlertRow,
  message: MessageRow,
};

function formatRange(state: ViewabilityState) {
  'worklet';
  if (state.visibleIds.length === 0) {
    return 'waiting';
  }
  return `${state.visibleIds[0]}-${state.visibleIds[state.visibleIds.length - 1]} (${state.visibleIds.length})`;
}

function ReText({
  className,
  value,
}: {
  className?: string;
  value: SharedValue<string>;
}) {
  const animatedProps = useAnimatedProps(() => ({
    text: value.value,
    value: value.value,
  }));

  return (
    <AnimatedTextInput
      animatedProps={animatedProps}
      caretHidden
      className={className}
      defaultValue={value.value}
      editable={false}
      pointerEvents="none"
      scrollEnabled={false}
      underlineColorAndroid="transparent"
    />
  );
}

export default function NitroListReanimatedScreen() {
  const insets = useSafeAreaInsets();
  const animatedViewability =
    useSharedValue<ViewabilityState>(EMPTY_VIEWABILITY);
  const workletRange = useSharedValue('waiting');

  const templates = useTemplate(TEMPLATES, { scope: 'nitrolist-reanimated' });
  const items = useMemo(() => templates.bindItems(ITEMS), [templates]);
  const options = useMemo(
    () => ({
      estimatedItemHeight: 96,
      overscanScreens: 1.2,
      viewabilityConfig: VIEWABILITY_CONFIG,
    }),
    [],
  );

  const { handle, status } = useHandle(items, options, {
    autoCreate: true,
    disposeOnUnmount: true,
  });

  const onViewabilityChangeWorklet = useCallback(
    (state: ViewabilityState) => {
      'worklet';
      workletRange.value = formatRange(state);
    },
    [workletRange],
  );

  return (
    <View className="flex-1 bg-surface">
      <View className="border-b border-border px-4 py-2">
        <View className="flex-row items-center">
          <Text className="text-xs font-bold text-muted">UI </Text>
          <ReText
            className="min-w-24 p-0 text-xs font-bold text-muted"
            value={workletRange}
          />
          <Text className="text-xs font-bold text-muted"> | {status}</Text>
        </View>
      </View>

      <View className="flex-1 overflow-hidden">
        {handle == null ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-sm font-bold text-muted">
              Creating Reanimated NitroList...
            </Text>
          </View>
        ) : (
          <NitroReanimatedListView
            contentContainerStyle={{
              paddingTop: 16,
              paddingBottom: insets.bottom,
            }}
            handle={handle}
            onViewabilityChangeWorklet={onViewabilityChangeWorklet}
            viewability={animatedViewability}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </View>
  );
}
