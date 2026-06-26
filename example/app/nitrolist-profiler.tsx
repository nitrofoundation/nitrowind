import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo } from 'react';
import { useHandle, useNitroListViewability, useTemplate } from 'nitrolist';
import { Text, View } from 'nitrowind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResoniteBitopushTools } from './useResoniteBitopushTools';

type NitroItem = {
  id: string;
  template: 'chat' | 'promo';
  props: {
    text: string;
    height?: number;
  };
};

const ITEM_COUNT = 1000;
const VIEWABILITY_CONFIG = {
  fallbackIndex: 0,
  overscanAfter: 2,
  overscanBefore: 2,
  windowSize: 8,
} as const;
const FLASHLIST_DRAW_DISTANCE = 1800;

const DATA: NitroItem[] = Array.from({ length: ITEM_COUNT }, (_, index) => {
  const id = String(index + 1);
  const isPromo = index % 5 === 0;
  const chatCopy = [
    `Inbox item ${id}: customer message ready for review. The note includes product context, store location, and a short follow-up summary so the row can grow naturally with content.`,
    `Work order ${id}: pickup window changed. Confirm the new arrival range, update the customer-facing status, and keep this message long enough to exercise auto-height layout.`,
    `Task ${id}: inventory check requires attention. Validate shelf count, compare the available quantity with the reserved quantity, and leave a clear audit note for the next associate.`,
    `Queue item ${id}: associate note attached. This entry carries a longer operational description to make sure NitroList measures dynamic row height instead of relying on fixed card sizes.`,
    `Service case ${id}: installation detail updated. Review the appointment notes, confirm whether the order has a dependency, and preserve the full message body for multiline row measurement.`,
    `Return request ${id}: customer added context. The row includes receipt status, product condition, resolution notes, and enough text to verify wrapping across light and dark themes.`,
    `Fulfillment alert ${id}: lane capacity changed. Use this longer operational update to test native auto-height behavior while scrolling through mixed row sizes.`,
    `Support thread ${id}: escalation summary available. The description intentionally spans multiple phrases so the NitroList template can prove that it measures content instead of clipping text.`,
  ];

  return {
    id,
    template: isPromo ? 'promo' : 'chat',
    props: {
      text: isPromo
        ? `Offer card ${id}: prioritized promotion. Highlighted rows include campaign context and a longer merchandising note so promo templates also exercise dynamic height.`
        : chatCopy[index % chatCopy.length]!,
    },
  };
});

const DATA_BY_ID = new Map(DATA.map(item => [item.id, item]));

type NitroTemplateProps = {
  height?: number;
  id: string;
  text?: string;
};

function NitroRow({
  promo,
  height,
  id,
  text,
}: NitroTemplateProps & { promo: boolean }) {
  return (
    <View
      className={`mx-3 my-1.5 rounded-xl border px-3 py-3 ${promo ? 'border-primary bg-surface-elevated' : 'border-border bg-surface-elevated'}`}
    >
      <Text
        className={`text-sm font-extrabold ${promo ? 'text-primary' : 'text-on-surface'}`}
      >
        #{id} · {promo ? 'promo' : 'message'}
      </Text>
      <Text className="mt-2 text-base text-on-surface">{text}</Text>
    </View>
  );
}

function ChatRow(props: NitroTemplateProps) {
  return <NitroRow {...props} promo={false} />;
}

function PromoRow(props: NitroTemplateProps) {
  return <NitroRow {...props} promo />;
}

const TEMPLATES = {
  chat: ChatRow,
  promo: PromoRow,
};

export default function NitroListProfiler() {
  const insets = useSafeAreaInsets();
  const templates = useTemplate(TEMPLATES, { scope: 'nitrolist-profiler' });
  const nitroItems = useMemo(() => templates.bindItems(DATA), [templates]);

  const options = useMemo(
    () => ({
      estimatedItemHeight: 96,
      overscanScreens: 1,
      viewabilityConfig: VIEWABILITY_CONFIG,
    }),
    [],
  );
  const { handle, handleRef, status } = useHandle(nitroItems, options, {
    autoCreate: true,
    disposeOnUnmount: true,
  });

  const viewability = useNitroListViewability(handleRef, DATA.length, {
    ...VIEWABILITY_CONFIG,
    eventThrottleMs: 80,
  });

  useResoniteBitopushTools({
    itemsById: DATA_BY_ID,
    viewability: viewability.viewability,
  });

  useEffect(() => {
    void viewability.refresh();
  }, [handle, viewability.refresh]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      const visibleIndices = viewableItems
        .map(item => item.index)
        .filter((index): index is number => index != null)
        .sort((left, right) => left - right);
      const firstVisibleIndex = visibleIndices[0] ?? 0;
      const lastVisibleIndex = visibleIndices.at(-1) ?? firstVisibleIndex;
      const firstRendered = Math.max(0, firstVisibleIndex - 2);
      const lastRendered = Math.min(DATA.length - 1, lastVisibleIndex + 2);
      const renderedIndices = Array.from(
        { length: Math.max(0, lastRendered - firstRendered + 1) },
        (_, index) => firstRendered + index,
      );
      const visibleSet = new Set(visibleIndices);
      const outsideViewportIndices = renderedIndices.filter(
        index => !visibleSet.has(index),
      );

      viewability.onViewabilityChange({
        nativeEvent: {
          firstVisibleIndex,
          lastVisibleIndex,
          visibleIndices,
          renderedIndices,
          outsideViewportIndices,
          visibleIds: visibleIndices.map(index => DATA[index]?.id ?? ''),
          renderedIds: renderedIndices.map(index => DATA[index]?.id ?? ''),
          outsideViewportIds: outsideViewportIndices.map(
            index => DATA[index]?.id ?? '',
          ),
        },
      } as Parameters<typeof viewability.onViewabilityChange>[0]);
    },
    [viewability.onViewabilityChange],
  );

  const renderItem = useCallback(({ item }: { item: NitroItem }) => {
    const Template = TEMPLATES[item.template];
    return <Template id={item.id} {...item.props} />;
  }, []);

  return (
    <View className="flex-1 bg-surface">
      <View className="border-b border-border px-4 py-2">
        <Text className="text-xs font-bold text-muted">
          visible {viewability.viewability.visibleIds.length} | rendered{' '}
          {viewability.viewability.renderedIds.length} | prerendered{' '}
          {viewability.viewability.outsideViewportIds.length} | {status}
        </Text>
      </View>

      <View className="flex-1 overflow-hidden">
        {handle == null ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-sm font-bold text-muted">
              Creating NitroList...
            </Text>
          </View>
        ) : (
          <FlashList
            contentContainerStyle={{
              paddingBottom: insets.bottom,
              paddingTop: 16,
            }}
            data={DATA}
            drawDistance={FLASHLIST_DRAW_DISTANCE}
            getItemType={item => item.template}
            keyExtractor={item => item.id}
            maintainVisibleContentPosition={{ disabled: true }}
            onViewableItemsChanged={onViewableItemsChanged}
            renderItem={renderItem}
          />
        )}
      </View>
    </View>
  );
}
