import { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  InteractionManager,
  Pressable as NativePressable,
  ScrollView as NativeScrollView,
  StyleSheet,
  Text as NativeText,
  View as NativeView,
} from "react-native";
import { Pressable, ScrollView, Text, View } from "nitrowind";

import { Section } from "../components/ui";

type ProfileMode = "nitrowind" | "style";

type ProfileItem = {
  id: number;
  tone: string;
  toneIndex: number;
};

type ProfileStats = {
  jsCommitMs?: number;
  firstLayoutMs?: number;
  contentLayoutMs?: number;
  interactionsSettledMs?: number;
};

type ProfileStatsByMode = Record<ProfileMode, ProfileStats>;

const ITEM_COUNT = 1000;
const DATA: ProfileItem[] = Array.from({ length: ITEM_COUNT }, (_, index) => ({
  id: index + 1,
  toneIndex: index % 4,
  tone:
    index % 4 === 0
      ? "bg-sky-500"
      : index % 4 === 1
        ? "bg-emerald-500"
        : index % 4 === 2
          ? "bg-amber-500"
          : "bg-rose-500",
}));

const now = () => globalThis.performance?.now?.() ?? Date.now();
const formatMs = (value: number | undefined) =>
  value === undefined ? "pending" : `${value.toFixed(1)} ms`;

const compareMs = (
  nitrowindValue: number | undefined,
  styleValue: number | undefined,
) => {
  if (nitrowindValue === undefined || styleValue === undefined)
    return "pending";
  const delta = nitrowindValue - styleValue;
  const prefix = delta > 0 ? "+" : "";
  return `${prefix}${delta.toFixed(1)} ms`;
};

const emptyStats = (): ProfileStatsByMode => ({
  nitrowind: {},
  style: {},
});

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-surface-elevated p-4">
      <Text className="text-xs font-semibold uppercase text-muted">
        {label}
      </Text>
      <Text className="mt-2 text-xl font-extrabold text-on-surface">
        {value}
      </Text>
    </View>
  );
}

const Row = memo(function Row({ item }: { item: ProfileItem }) {
  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface-elevated p-3">
      <View className={`h-10 w-10 rounded-xl ${item.tone}`} />
      <View className="flex-1">
        <Text className="text-sm font-bold text-on-surface">
          Nitrowind row {item.id}
        </Text>
        <Text className="text-xs text-muted">
          rounded border bg text spacing shadow native class resolution
        </Text>
      </View>
      <Text className="text-xs font-semibold text-muted">{item.id}</Text>
    </View>
  );
});

const StyleRow = memo(function StyleRow({ item }: { item: ProfileItem }) {
  return (
    <NativeView style={styles.row}>
      <NativeView style={[styles.swatch, styleTones[item.toneIndex]]} />
      <NativeView style={styles.rowBody}>
        <NativeText style={styles.rowTitle}>Style row {item.id}</NativeText>
        <NativeText style={styles.rowCaption}>
          rounded border bg text spacing shadow StyleSheet resolution
        </NativeText>
      </NativeView>
      <NativeText style={styles.rowNumber}>{item.id}</NativeText>
    </NativeView>
  );
});

function ModeStats({ title, stats }: { title: string; stats: ProfileStats }) {
  return (
    <View className="gap-2 rounded-2xl border border-border bg-surface-elevated p-4">
      <Text className="text-sm font-extrabold text-on-surface">{title}</Text>
      <View className="flex-row gap-2">
        <Stat label="commit" value={formatMs(stats.jsCommitMs)} />
        <Stat label="layout" value={formatMs(stats.firstLayoutMs)} />
      </View>
      <View className="flex-row gap-2">
        <Stat label="content" value={formatMs(stats.contentLayoutMs)} />
        <Stat label="settled" value={formatMs(stats.interactionsSettledMs)} />
      </View>
    </View>
  );
}

export default function Profiling() {
  const [runId, setRunId] = useState(0);
  const [activeMode, setActiveMode] = useState<ProfileMode>("nitrowind");
  const [statsByMode, setStatsByMode] =
    useState<ProfileStatsByMode>(emptyStats);
  const startedAt = useRef(0);
  const firstLayoutCaptured = useRef(false);
  const contentLayoutCaptured = useRef(false);
  const data = useMemo(() => DATA, []);

  const runProfile = useCallback((mode: ProfileMode) => {
    firstLayoutCaptured.current = false;
    contentLayoutCaptured.current = false;
    const start = now();
    startedAt.current = start;
    setActiveMode(mode);
    setStatsByMode((current) => ({ ...current, [mode]: {} }));
    setRunId((current) => current + 1);
    requestAnimationFrame(() => {
      setStatsByMode((current) => ({
        ...current,
        [mode]: { ...current[mode], jsCommitMs: now() - start },
      }));
    });
    InteractionManager.runAfterInteractions(() => {
      setStatsByMode((current) => ({
        ...current,
        [mode]: {
          ...current[mode],
          interactionsSettledMs: now() - start,
        },
      }));
    });
  }, []);

  const onListLayout = useCallback(() => {
    if (firstLayoutCaptured.current || startedAt.current === 0) return;
    firstLayoutCaptured.current = true;
    setStatsByMode((current) => ({
      ...current,
      [activeMode]: {
        ...current[activeMode],
        firstLayoutMs: now() - startedAt.current,
      },
    }));
  }, [activeMode]);

  const onContentSizeChange = useCallback(() => {
    if (contentLayoutCaptured.current || startedAt.current === 0 || runId === 0)
      return;
    contentLayoutCaptured.current = true;
    setStatsByMode((current) => ({
      ...current,
      [activeMode]: {
        ...current[activeMode],
        contentLayoutMs: now() - startedAt.current,
      },
    }));
  }, [activeMode, runId]);

  const nitrowindStats = statsByMode.nitrowind;
  const styleStats = statsByMode.style;

  const header = (
    <Section
      title="1000 item list profile"
      subtitle="Compare Nitrowind className rows against plain React Native StyleSheet rows by directly mapping all items inside one parent ScrollView."
    >
      <View className="gap-4">
        <View className="flex-row gap-3">
          <Stat label="items" value={String(ITEM_COUNT)} />
          <Stat label="active" value={activeMode} />
        </View>
        <ModeStats title="Nitrowind" stats={nitrowindStats} />
        <ModeStats title="StyleSheet" stats={styleStats} />
        <View className="gap-2 rounded-2xl border border-border bg-surface-elevated p-4">
          <Text className="text-sm font-extrabold text-on-surface">
            Delta: Nitrowind minus StyleSheet
          </Text>
          <Stat
            label="content layout"
            value={compareMs(
              nitrowindStats.contentLayoutMs,
              styleStats.contentLayoutMs,
            )}
          />
        </View>
        <View className="flex-row gap-3">
          <NativePressable
            accessibilityRole="button"
            onPress={() => runProfile("nitrowind")}
            className="flex-1 rounded-2xl bg-primary px-4 py-4 justify-center items-center active:opacity-80"
          >
            <NativeText className="text-base font-extrabold text-primary-foreground">
              Run Nitrowind
            </NativeText>
          </NativePressable>
          <NativePressable
            accessibilityRole="button"
            onPress={() => runProfile("style")}
            style={({ pressed }) => [
              styles.button,
              pressed ? styles.buttonPressed : undefined,
            ]}
          >
            <NativeText style={styles.buttonText}>Run StyleSheet</NativeText>
          </NativePressable>
        </View>
      </View>
    </Section>
  );

  const empty = (
    <View className="rounded-2xl border border-border bg-surface-elevated p-4">
      <Text className="text-sm font-semibold text-muted">
        Run either profile to map 1000 rows into one parent ScrollView.
      </Text>
    </View>
  );

  if (activeMode === "style") {
    return (
      <NativeView style={styles.screen}>
        <NativeScrollView
          key={`${activeMode}-${runId}`}
          style={styles.list}
          contentContainerStyle={styles.contentContainer}
          onLayout={onListLayout}
          onContentSizeChange={onContentSizeChange}
        >
          {header}
          {runId > 0
            ? data.map((item) => <StyleRow key={item.id} item={item} />)
            : empty}
        </NativeScrollView>
      </NativeView>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <ScrollView
        key={`${activeMode}-${runId}`}
        className="flex-1 bg-surface"
        contentContainerClassName="gap-2 px-safe-or-4 pb-safe-offset-10 pt-6"
        onLayout={onListLayout}
        onContentSizeChange={onContentSizeChange}
      >
        {header}
        {runId > 0
          ? data.map((item) => <Row key={item.id} item={item} />)
          : empty}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  list: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  contentContainer: {
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 24,
  },
  row: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#d8dee9",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  swatch: {
    borderRadius: 12,
    height: 40,
    width: 40,
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
  },
  rowCaption: {
    color: "#64748b",
    fontSize: 12,
  },
  rowNumber: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
  },
  button: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 16,
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
});

const toneStyles = StyleSheet.create({
  sky: { backgroundColor: "#0ea5e9" },
  emerald: { backgroundColor: "#10b981" },
  amber: { backgroundColor: "#f59e0b" },
  rose: { backgroundColor: "#f43f5e" },
});

const styleTones = [
  toneStyles.sky,
  toneStyles.emerald,
  toneStyles.amber,
  toneStyles.rose,
] as const;
