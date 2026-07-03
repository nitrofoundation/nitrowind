/**
 * NitroList — native, UI-thread virtualized list. The per-frame scroll → window
 * → cull loop runs entirely on the UI thread (native scroll observer → C++
 * engine → ShadowTreeMutator commit), not on the JS thread. Cells are ordinary
 * nitrowind-styled React subtrees, committed once and toggled natively.
 *
 * See docs/nitrolist/ui-thread-engine.md. The native engine is being wired in
 * stages; until then this renders all cells (uncelled base).
 */
import { Text, View } from '@nitrofoundation/nitrowind';
import { NitroList } from '@nitrofoundation/nitrolist';

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

function ListRow({ item }: { item: Row }) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <View className={`h-11 w-11 rounded-xl ${item.tone}`} />
      <View className="flex-1">
        <Text className="text-base font-bold text-on-surface">{item.title}</Text>
        <Text className="text-sm text-muted">
          Styled React cell · native UI-thread cull
        </Text>
      </View>
      <Text className="text-2xl text-muted">{'›'}</Text>
    </View>
  );
}

export default function NitroListScreen() {
  return (
    <View className="flex-1 bg-surface">
      <Text className="px-4 pb-2 pt-3 text-xs text-muted">
        {DATA.length} styled cells · native UI-thread engine
      </Text>
      <NitroList
        data={DATA}
        keyExtractor={(it: Row) => it.id}
        estimatedItemSize={68}
        renderItem={({ item }: { item: Row }) => <ListRow item={item} />}
        style={{ flex: 1 }}
      />
    </View>
  );
}
