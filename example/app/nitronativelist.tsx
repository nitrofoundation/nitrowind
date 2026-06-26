import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useRef, useState } from 'react';
import NitroList, { useHandle, useTemplate } from 'nitrolist/native';
import { Pressable, Text, View } from 'nitrowind';

import { Card, Section } from '../components/ui';

type DemoItem = {
  id: string;
  template: 'chat' | 'promo';
  props: Record<string, unknown>;
};

type NativeTemplateProps = {
  cta?: string;
  id: string;
  index: number;
  text?: string;
};

function ChatRow({ id, text }: NativeTemplateProps) {
  return (
    <View className="mx-1 mb-2 rounded-xl border border-border bg-surface-elevated px-3 py-3">
      <Text className="text-xs font-bold uppercase text-muted">
        Message {id}
      </Text>
      <Text className="mt-1 text-sm text-on-surface">{text}</Text>
    </View>
  );
}

function PromoRow({ cta, id }: NativeTemplateProps) {
  return (
    <View className="mx-1 mb-2 rounded-xl border border-amber-300 bg-amber-100 px-3 py-3">
      <Text className="text-xs font-bold uppercase text-amber-700">
        Promo {id}
      </Text>
      <Text className="mt-1 text-sm font-semibold text-amber-950">{cta}</Text>
    </View>
  );
}

const WORD_BANK = [
  'native',
  'virtualized',
  'window',
  'scroll',
  'performant',
  'recycle',
  'template',
  'surface',
  'render',
  'layout',
  'interaction',
  'synchronize',
  'animated',
  'measurement',
  'bridge',
  'batch',
  'anchor',
  'stable',
  'momentum',
  'viewport',
];

function seededRandom(seed: number): () => number {
  let current = seed;
  return () => {
    current = (current * 1664525 + 1013904223) >>> 0;
    return current / 0xffffffff;
  };
}

function buildRandomText(seed: number, minChars = 10, maxChars = 200): string {
  const next = seededRandom(seed);
  const target =
    minChars + Math.floor(next() * Math.max(1, maxChars - minChars + 1));

  let text = '';
  while (text.length < target) {
    const word = WORD_BANK[Math.floor(next() * WORD_BANK.length)] ?? 'item';
    text = text.length === 0 ? word : `${text} ${word}`;
  }

  return text.slice(0, target);
}

const INITIAL_ITEMS: DemoItem[] = Array.from({ length: 1000 }, (_, index) => {
  const id = String(index + 1);
  const isPromo = index % 5 === 0;
  const bodyText = buildRandomText(index + 17, 10, 200);
  return {
    id,
    template: isPromo ? 'promo' : 'chat',
    props: isPromo
      ? { cta: `Promo ${id}: ${bodyText}` }
      : { text: `Message ${id}: ${bodyText}` },
  };
});
const FLASHLIST_DRAW_DISTANCE = 1800;

export default function NitroNativeListScreen() {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [actionStatus, setActionStatus] = useState<string>('idle');
  const listRef = useRef<any>(null);
  const listReadyRef = useRef(false);
  const pendingScrollIndexRef = useRef<number | null>(null);

  const nativeAvailable = NitroList.isNativeAvailable();

  const templateCatalog = useMemo(
    () => ({
      chat: ChatRow,
      promo: PromoRow,
    }),
    [],
  );
  const templates = useTemplate(templateCatalog, {
    scope: 'nitro-native-list',
  });
  const nativeItems = useMemo(
    () => templates.bindItems(INITIAL_ITEMS),
    [templates],
  );

  const options = useMemo(
    () => ({
      estimatedItemHeight: 88,
      overscanScreens: 2,
      paginationConfig: {
        initialIndex: 0,
        snapEveryItems: 50,
      },
      viewabilityConfig: {
        fallbackIndex: 0,
        overscanAfter: 4,
        overscanBefore: 4,
        windowSize: 6,
      },
    }),
    [],
  );

  const { handle, status, handleRef } = useHandle(nativeItems, options, {
    autoCreate: true,
    disposeOnUnmount: true,
  });

  const scrollTargets = [0, 50, 150, 400, 999];

  const scrollVisibleListToIndex = useCallback((index: number) => {
    const list = listRef.current;
    if (list == null || !listReadyRef.current) {
      pendingScrollIndexRef.current = index;
      return false;
    }

    pendingScrollIndexRef.current = null;
    void list.scrollToIndex?.({
      animated: false,
      index,
      viewPosition: 0,
    });
    requestAnimationFrame(() => {
      void listRef.current?.scrollToIndex?.({
        animated: true,
        index,
        viewPosition: 0,
      });
    });
    return true;
  }, []);

  const onListLoad = useCallback(() => {
    listReadyRef.current = true;
    const pendingIndex = pendingScrollIndexRef.current;
    if (pendingIndex != null) {
      requestAnimationFrame(() => {
        scrollVisibleListToIndex(pendingIndex);
      });
    }
  }, [scrollVisibleListToIndex]);

  const scrollToIndex = (index: number) => {
    if (!handleRef.scrollToIndex(index, true)) {
      setActionStatus('list is still creating');
      return;
    }

    setActiveIndex(index);
    const visibleScrollStarted = scrollVisibleListToIndex(index);
    setActionStatus(
      visibleScrollStarted
        ? `scrolled to index ${index}`
        : `queued scroll to index ${index}`,
    );
  };

  const renderItem = useCallback(({ item, index }: { item: DemoItem; index: number }) => {
    const Template = templateCatalog[item.template];
    return <Template id={item.id} index={index} {...item.props} />;
  }, [templateCatalog]);

  return (
    <View className="flex-1 bg-surface px-4">
      <Section
        className="flex-1"
        title="Native Surface"
        subtitle="Native handle and window config with JS templates for visible rows."
      >
        <View className="gap-1">
          <Text className="text-xs text-muted">
            Native module available:{' '}
            {nativeAvailable ? 'yes' : 'no (legacy JS fallback)'}
          </Text>
          <Text className="text-xs text-muted">Status: {status}</Text>
          <Text className="text-xs text-muted">Action: {actionStatus}</Text>
        </View>
        <View className="mb-2 flex-row gap-2">
          {scrollTargets.map(index => (
            <Pressable
              key={index}
              className={`rounded-full border px-3 py-1.5 ${
                activeIndex === index
                  ? 'border-primary bg-primary'
                  : 'border-border bg-surface-elevated'
              }`}
              accessibilityRole="button"
              onPress={() => scrollToIndex(index)}
            >
              <Text
                className={`text-xs font-bold ${
                  activeIndex === index
                    ? 'text-primary-foreground'
                    : 'text-on-surface'
                }`}
              >
                {index}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="flex-1  overflow-hidden">
          {handle == null ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-sm text-muted">
                Creating native list view...
              </Text>
            </View>
          ) : (
            <View className="flex-1 px-3">
              <FlashList
                ref={listRef}
                data={INITIAL_ITEMS}
                drawDistance={FLASHLIST_DRAW_DISTANCE}
                getItemType={item => item.template}
                keyExtractor={item => item.id}
                maintainVisibleContentPosition={{ disabled: true }}
                onLoad={onListLoad}
                renderItem={renderItem}
              />
            </View>
          )}
        </View>
      </Section>
    </View>
  );
}
