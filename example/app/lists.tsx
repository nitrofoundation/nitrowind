import { useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { LazyHStack, LazyVStack, type Range } from "nitrolist";
import { Text, View } from "nitrowind";

type FeedItem = {
  id: number;
  title: string;
  meta: string;
  tone: string;
};

const TONES = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-fuchsia-500",
  "bg-indigo-500",
];

const FEATURE_CHIPS = [
  { label: "native window", tone: "bg-sky-500" },
  { label: "measured cells", tone: "bg-emerald-500" },
  { label: "spacers", tone: "bg-amber-500" },
  { label: "horizontal", tone: "bg-fuchsia-500" },
  { label: "stable keys", tone: "bg-indigo-500" },
  { label: "JS fallback", tone: "bg-rose-500" },
];

const ITEMS: FeedItem[] = Array.from({ length: 240 }, (_, index) => ({
  id: index + 1,
  title: `Virtual row ${index + 1}`,
  meta:
    index % 3 === 0
      ? "tall measured item"
      : index % 3 === 1
        ? "estimated before layout"
        : "recycled render slot",
  tone: TONES[index % TONES.length] ?? "bg-sky-500",
}));

function RangePill({ range }: { range: Range }) {
  return (
    <View className="self-start rounded-full bg-primary px-4 py-2">
      <Text className="text-sm font-extrabold text-primary-foreground">
        window {range.first}-{range.last}
      </Text>
    </View>
  );
}

function Header({ range }: { range: Range }) {
  return (
    <View className="gap-4 rounded-2xl border border-border bg-surface-elevated p-4">
      <View className="gap-1">
        <Text className="text-3xl font-extrabold text-on-surface">
          Nitrolist
        </Text>
        <Text className="text-sm leading-5 text-muted">
          Lazy stacks render a moving window from mapped React children while
          the list engine tracks measurements, estimates, and spacer sizes.
        </Text>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1 rounded-2xl bg-surface p-4">
          <Text className="text-xs font-bold uppercase text-muted">items</Text>
          <Text className="mt-1 text-2xl font-extrabold text-on-surface">
            {ITEMS.length}
          </Text>
        </View>
        <View className="flex-1 rounded-2xl bg-surface p-4">
          <Text className="text-xs font-bold uppercase text-muted">stack</Text>
          <Text className="mt-1 text-2xl font-extrabold text-on-surface">
            V/H
          </Text>
        </View>
      </View>
      <RangePill range={range} />
    </View>
  );
}

function FeatureRail() {
  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface-elevated p-4">
      <View className="gap-1">
        <Text className="text-base font-bold text-on-surface">LazyHStack</Text>
        <Text className="text-sm text-muted">
          The horizontal stack uses the same virtual window contract.
        </Text>
      </View>
      <LazyHStack
        showsHorizontalScrollIndicator={false}
        style={styles.horizontalList}
        contentContainerStyle={styles.horizontalContent}
        itemContainerStyle={styles.horizontalItem}
      >
        {FEATURE_CHIPS.map((chip) => (
          <View
            key={chip.label}
            className={`h-24 w-36 justify-between rounded-2xl p-4 ${chip.tone}`}
          >
            <Text className="text-xs font-bold uppercase text-white/80">
              nitrolist
            </Text>
            <Text className="text-lg font-extrabold text-white">
              {chip.label}
            </Text>
          </View>
        ))}
      </LazyHStack>
    </View>
  );
}

function Row({ item }: { item: FeedItem }) {
  const tall = item.id % 7 === 0;
  return (
    <View
      className={`flex-row gap-4 rounded-2xl border border-border bg-surface-elevated p-4 ${
        tall ? "min-h-28" : "min-h-20"
      }`}
    >
      <View
        className={`h-12 w-12 items-center justify-center rounded-xl ${item.tone}`}
      >
        <Text className="text-base font-extrabold text-white">{item.id}</Text>
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-base font-extrabold text-on-surface">
          {item.title}
        </Text>
        <Text className="text-sm text-muted">{item.meta}</Text>
        {tall ? (
          <Text className="text-sm leading-5 text-muted">
            This row is intentionally taller so the list can replace estimates
            with measured cell lengths as layout arrives.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export default function Lists() {
  const [range, setRange] = useState<Range>({ first: 0, last: 0 });
  const items = useMemo(() => ITEMS, []);

  return (
    <View className="flex-1 bg-surface">
      <LazyVStack
        onVisibleRangeChange={setRange}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={styles.content}
        itemContainerStyle={styles.item}
      >
        <Header key="header" range={range} />
        <FeatureRail key="features" />
        {items.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </LazyVStack>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
    gap: 12,
  },
  item: {
    alignSelf: "stretch",
  },
  horizontalList: {
    alignSelf: "stretch",
  },
  horizontalContent: {
    gap: 12,
    paddingRight: 4,
  },
  horizontalItem: {
    width: 144,
  },
});
