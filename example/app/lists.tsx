import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'nitrowind';
import { createVirtualCollectionView } from 'react-native/src/private/components/virtualcollection/VirtualCollectionView'
import { Section } from '../components/ui';

type DemoChip = {
  id: string;
  title: string;
  tone: string;
};

const List = createVirtualCollectionView(1000, { initial: 0, size: 1000 })

const TONES = [
  'bg-sky-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-indigo-500',
  'bg-fuchsia-500',
];

const HORIZONTAL_ITEMS: DemoChip[] = Array.from({ length: 12 }, (_, index) => ({
  id: `chip-${index + 1}`,
  title: `Chip ${index + 1}`,
  tone: TONES[index % TONES.length] ?? 'bg-sky-500',
}));

const VERTICAL_ITEMS: DemoChip[] = Array.from({ length: 18 }, (_, index) => ({
  id: `row-${index + 1}`,
  title: `Styled row ${index + 1}`,
  tone: TONES[index % TONES.length] ?? 'bg-sky-500',
}));

export default function Lists() {
  const [chips, setChips] = useState<DemoChip[]>(HORIZONTAL_ITEMS);

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

  return (
    <View className="flex-1 bg-surface">
      <FlatList
        data={[{ key: 'content' }]}
        keyExtractor={item => item.key}
        className="flex-1"
        renderItem={() => (
          <View className="gap-4 px-safe-or-4 pb-safe-offset-8 pt-4">
            <Section
              title="Vertical Rows"
              subtitle="Nitrowind styled FlatList rows with stable spacing and theme colors."
            >
              <FlatList
                data={VERTICAL_ITEMS}
                keyExtractor={item => item.id}
                scrollEnabled={false}
                contentContainerClassName="gap-3"
                renderItem={({ item }) => (
                  <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface-elevated p-4">
                    <View className={`h-10 w-10 rounded-xl ${item.tone}`} />
                    <View className="flex-1">
                      <Text className="text-base font-extrabold text-on-surface">
                        {item.title}
                      </Text>
                      <Text className="text-sm text-muted">
                        Styled with className and contentContainerClassName.
                      </Text>
                    </View>
                  </View>
                )}
              />
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

                <List />
                {/* <FlatList
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
                /> */}
              </View>
            </Section>
          </View>
        )}
      />
    </View>
  );
}
