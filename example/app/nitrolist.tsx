/**
 * NitroList — three isolated, differently-named list variants over one shared
 * windowing core, each keeping its engine use off nitrocss's style-commit path.
 *
 *  - NitroListVirtual — render-only-window (memory-bounded; the default).
 *  - NitroListValdi   — keep every cell's fibers alive; hide off-window (state-safe).
 *  - NitroListLynx    — template-fast cells + aggressive prerender (blank-averse).
 *
 * Cells are ordinary nitrowind-styled React subtrees (className), proving styled
 * cells + the list engine coexist without commit contention.
 */
import { useState } from 'react';
import { Pressable, Text, View } from '@nitrofoundation/nitrowind';
import {
  NitroListLynx,
  NitroListValdi,
  NitroListVirtual,
} from '@nitrofoundation/nitrolist';

type Row = { id: string; title: string; tone: string };

const TONES = [
  'bg-violet-500',
  'bg-rose-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-sky-500',
  'bg-fuchsia-500',
  'bg-indigo-500',
  'bg-teal-500',
];

const DATA: Row[] = Array.from({ length: 800 }, (_, i) => ({
  id: `row-${i}`,
  title: `Item ${i + 1}`,
  tone: TONES[i % TONES.length]!,
}));

const VARIANTS = ['virtual', 'valdi', 'lynx'] as const;
type Variant = (typeof VARIANTS)[number];

function ListRow({ item }: { item: Row }) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <View className={`h-11 w-11 rounded-xl ${item.tone}`} />
      <View className="flex-1">
        <Text className="text-base font-bold text-on-surface">{item.title}</Text>
        <Text className="text-sm text-muted">
          Styled React cell · nitrocss className
        </Text>
      </View>
      <Text className="text-2xl text-muted">{'›'}</Text>
    </View>
  );
}

export default function NitroListScreen() {
  const [variant, setVariant] = useState<Variant>('virtual');

  const listProps = {
    data: DATA,
    keyExtractor: (it: Row) => it.id,
    estimatedItemSize: 68,
    renderItem: ({ item }: { item: Row }) => <ListRow item={item} />,
    style: { flex: 1 },
  } as const;

  return (
    <View className="flex-1 bg-surface">
      <View className="flex-row gap-2 px-4 pb-2 pt-3">
        {VARIANTS.map((v) => (
          <Pressable
            key={v}
            onPress={() => setVariant(v)}
            className={`rounded-xl px-3 py-2 ${
              v === variant ? 'bg-primary' : 'border border-border'
            }`}
          >
            <Text
              className={`text-sm font-bold ${
                v === variant ? 'text-primary-foreground' : 'text-on-surface'
              }`}
            >
              {v}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text className="px-4 pb-2 text-xs text-muted">
        {DATA.length} styled cells · variant: {variant}
      </Text>
      {variant === 'virtual' ? (
        <NitroListVirtual key="virtual" {...listProps} />
      ) : variant === 'valdi' ? (
        <NitroListValdi key="valdi" {...listProps} />
      ) : (
        <NitroListLynx key="lynx" {...listProps} />
      )}
    </View>
  );
}
