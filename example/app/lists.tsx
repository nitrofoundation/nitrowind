import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState } from 'react';
import NitroList, {
  useHandle,
  usePaging,
  useTemplate,
  useViewability,
} from 'nitrolist/native';
import { FlatList, Pressable, Text, View } from 'nitrowind';

import { Card, Section } from '../components/ui';

type DemoChip = {
  id: string;
  title: string;
  tone: string;
};

type PageItem = {
  id: string;
  template: 'page';
  props: {
    text: string;
  };
};

type PageTemplateProps = {
  id: string;
  index: number;
  text: string;
};

const TONES = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-fuchsia-500',
];

const PAGED_ITEMS: PageItem[] = Array.from({ length: 24 }, (_, index) => ({
  id: `page-${index + 1}`,
  template: 'page',
  props: {
    text: `Page ${index + 1} - Nitro hook based paging and viewability demo`,
  },
}));
const FLASHLIST_DRAW_DISTANCE = 900;

const HORIZONTAL_ITEMS: DemoChip[] = Array.from({ length: 12 }, (_, index) => ({
  id: `chip-${index + 1}`,
  title: `Chip ${index + 1}`,
  tone: TONES[index % TONES.length] ?? 'bg-sky-500',
}));

function PageTemplateRow({ id, index, text }: PageTemplateProps) {
  return (
    <View className="mx-1 mb-2 rounded-xl border border-border bg-surface-elevated px-3 py-4">
      <Text className="text-xs font-bold uppercase text-muted">
        {id} / snap group {Math.floor(index / 3) + 1}
      </Text>
      <Text className="mt-1 text-sm font-semibold text-on-surface">{text}</Text>
    </View>
  );
}

export default function Lists() {
  const [chips, setChips] = useState<DemoChip[]>(HORIZONTAL_ITEMS);

  const templateCatalog = useMemo(
    () => ({
      page: PageTemplateRow,
    }),
    [],
  );
  const templates = useTemplate(templateCatalog, { scope: 'lists-paged' });
  const pagedItems = useMemo(
    () => templates.bindItems(PAGED_ITEMS),
    [templates],
  );

  const options = useMemo(
    () => ({
      estimatedItemHeight: 108,
      overscanScreens: 1.2,
      paginationConfig: {
        initialIndex: 0,
        snapEveryItems: 3,
      },
      viewabilityConfig: {
        fallbackIndex: 0,
        overscanAfter: 2,
        overscanBefore: 2,
        windowSize: 3,
      },
    }),
    [],
  );

  const { handle, status, handleRef } = useHandle(pagedItems, options, {
    autoCreate: true,
    disposeOnUnmount: true,
  });

  const paging = usePaging(handleRef, PAGED_ITEMS.length, {
    snapEveryItems: 3,
    initialIndex: 0,
  });

  const viewability = useViewability(handleRef, PAGED_ITEMS.length, {
    windowSize: 3,
    overscanBefore: 2,
    overscanAfter: 2,
    fallbackIndex: paging.currentIndex,
  });

  const addHorizontalItem = () => {
    setChips(current => {
      const nextIndex = current.length + 1;
      const tone = TONES[nextIndex % TONES.length] ?? 'bg-sky-500';
      return [
        ...current,
        {
          id: `chip-${nextIndex}`,
          title: `Chip ${nextIndex}`,
          tone,
        },
      ];
    });
  };

  const removeHorizontalItem = () => {
    setChips(current => current.slice(0, -1));
  };

  const renderPagedItem = useCallback(
    ({ item, index }: { item: PageItem; index: number }) => (
      <PageTemplateRow id={item.id} index={index} {...item.props} />
    ),
    [],
  );

  return (
    <View className="flex-1 bg-surface">
      <FlatList
        data={[{ key: 'content' }]}
        keyExtractor={item => item.key}
        className="flex-1"
        renderItem={() => (
          <View className="gap-4 px-safe-or-4 pb-safe-offset-8 pt-4">
            <Section
              title="Nitro Hooks: Snap Paging + Viewability"
              subtitle="Native-side handle config with JS templates for the rendered rows."
            >
              <View className="gap-3">
                <Card className="gap-1">
                  <Text className="text-xs text-muted">status: {status}</Text>
                  <Text className="text-xs text-muted">
                    snap: {paging.snapIndex + 1} / {paging.snapCount}
                  </Text>
                  <Text className="text-xs text-muted">
                    snap points: {paging.snapPoints.join(', ')}
                  </Text>
                  <Text className="text-xs text-muted">
                    visible: {viewability.visibleIds.join(', ') || 'none'}
                  </Text>
                  <Text className="text-xs text-muted">
                    rendered: {viewability.renderedIds.join(', ') || 'none'}
                  </Text>
                  <Text className="text-xs text-muted">
                    outside viewport:{' '}
                    {viewability.outsideViewportIds.join(', ') || 'none'}
                  </Text>
                </Card>

                <View className="flex-row gap-2">
                  <Pressable
                    className="rounded-xl border border-border px-3 py-2"
                    onPress={() => paging.prevSnap(true)}
                  >
                    <Text className="text-sm font-bold text-on-surface">
                      Prev Snap
                    </Text>
                  </Pressable>
                  <Pressable
                    className="rounded-xl bg-primary px-3 py-2"
                    onPress={() => paging.nextSnap(true)}
                  >
                    <Text className="text-sm font-bold text-primary-foreground">
                      Next Snap
                    </Text>
                  </Pressable>
                  <Pressable
                    className="rounded-xl border border-border px-3 py-2"
                    onPress={() => paging.goToSnap(4, true)}
                  >
                    <Text className="text-sm font-bold text-on-surface">
                      Snap #5
                    </Text>
                  </Pressable>
                </View>

                <Card className="h-72 p-0 overflow-hidden">
                  {handle == null ? (
                    <View className="flex-1 items-center justify-center">
                      <Text className="text-sm text-muted">
                        Creating Nitro list...
                      </Text>
                    </View>
                  ) : (
                    <View className="flex-1 px-2 py-2">
                      <FlashList
                        data={PAGED_ITEMS}
                        drawDistance={FLASHLIST_DRAW_DISTANCE}
                        getItemType={item => item.template}
                        keyExtractor={item => item.id}
                        maintainVisibleContentPosition={{ disabled: true }}
                        renderItem={renderPagedItem}
                      />
                    </View>
                  )}
                </Card>
              </View>
            </Section>

            <Section
              title="Horizontal Enter / Exit"
              subtitle="Animated horizontal lane for enter/exit interactions."
            >
              <View className="gap-3">
                <View className="flex-row gap-2">
                  <Pressable
                    className="rounded-xl bg-primary px-3 py-2"
                    onPress={addHorizontalItem}
                  >
                    <Text className="text-sm font-bold text-primary-foreground">
                      Add Item
                    </Text>
                  </Pressable>
                  <Pressable
                    className="rounded-xl border border-border px-3 py-2"
                    onPress={removeHorizontalItem}
                  >
                    <Text className="text-sm font-bold text-on-surface">
                      Remove Item
                    </Text>
                  </Pressable>
                </View>

                <FlatList
                  data={chips}
                  horizontal
                  keyExtractor={item => item.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-3 pr-3"
                  renderItem={({ item }) => (
                    <View
                      className={`h-28 w-44 justify-between rounded-2xl p-4 ${item.tone} entering-fade-in-up entering-duration-300 exiting-fade-out exiting-duration-250`}
                    >
                      <Text className="text-xs font-bold uppercase text-white/80">
                        horizontal
                      </Text>
                      <Text className="text-lg font-extrabold text-white">
                        {item.title}
                      </Text>
                    </View>
                  )}
                />
              </View>
            </Section>
          </View>
        )}
      />
    </View>
  );
}
