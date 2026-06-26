import { FlashList } from '@shopify/flash-list';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  InteractionManager,
  Modal,
  StyleSheet,
  type ViewToken,
  View as NativeView,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import rnPerformance from 'react-native-performance';
import { useNitroListViewability, type NativeHandleRef } from 'nitrolist';
import NitroList from 'nitrolist/native';

import { Section } from '../components/ui';

type BenchmarkMode = 'nitro' | 'flash' | 'legend';

type BenchmarkItem = {
  id: string;
  template: 'chat' | 'promo';
  props: {
    text: string;
    height?: number;
  };
};

type BenchmarkStats = {
  jsCommitMs?: number;
  firstLayoutMs?: number;
  interactionsSettledMs?: number;
  visibleCount?: number;
  renderedCount?: number;
  prerenderedCount?: number;
  visibleIds?: string[];
  renderedIds?: string[];
  prerenderedIds?: string[];
  jsFrames?: number;
  jsFrameDrops?: number;
  uiFrames?: number;
  uiFrameDrops?: number;
  minMemoryMb?: number;
  maxMemoryMb?: number;
};

type BenchmarkStatsByMode = Record<BenchmarkMode, BenchmarkStats>;

const NUMERIC_METRIC_KEYS = [
  'jsCommitMs',
  'firstLayoutMs',
  'interactionsSettledMs',
  'visibleCount',
  'renderedCount',
  'prerenderedCount',
  'jsFrames',
  'jsFrameDrops',
  'uiFrames',
  'uiFrameDrops',
  'minMemoryMb',
  'maxMemoryMb',
] as const;

type MetricKey = (typeof NUMERIC_METRIC_KEYS)[number];
type ChartKind = 'bar' | 'line';
type InspectorTab = 'overview' | 'nitrolist';

type NitroListInspectorEventMap = {
  setSnapshot: {
    mode: BenchmarkMode;
    visibleIds: string[];
    renderedIds: string[];
    prerenderedIds: string[];
    visibleCount: number;
    renderedCount: number;
    prerenderedCount: number;
    jsCommitMs: number | null;
    firstLayoutMs: number | null;
    interactionsSettledMs: number | null;
    jsFrames: number | null;
    jsFrameDrops: number | null;
    uiFrames: number | null;
    uiFrameDrops: number | null;
    minMemoryMb: number | null;
    maxMemoryMb: number | null;
    renderedItems: Array<{
      id: string;
      template: string;
      text: string;
      height: number | null;
    }>;
  };
};

type NitroListInspectorSnapshot = NitroListInspectorEventMap['setSnapshot'];

const ITEM_COUNT = 1000;
const AUTO_SCROLL_INDEX = 850;
const FRAME_SAMPLE_MS = 1000;
const MODE_SEQUENCE: BenchmarkMode[] = ['nitro', 'flash', 'legend'];
const VIEWABILITY_CONFIG = {
  fallbackIndex: 0,
  overscanAfter: 2,
  overscanBefore: 2,
  windowSize: 8,
} as const;
const FLASHLIST_DRAW_DISTANCE = 1800;

const DATA: BenchmarkItem[] = Array.from({ length: ITEM_COUNT }, (_, index) => {
  const isPromo = index % 5 === 0;
  const id = String(index + 1);
  const chatCopy = [
    `Inbox item ${id}: customer message ready for review`,
    `Work order ${id}: pickup window changed`,
    `Task ${id}: inventory check requires attention`,
    `Queue item ${id}: associate note attached`,
  ];
  return {
    id,
    template: isPromo ? 'promo' : 'chat',
    props: {
      text: isPromo
        ? `Offer card ${id}: prioritized promotion`
        : chatCopy[index % chatCopy.length]!,
    },
  };
});
const DATA_BY_ID = new Map(DATA.map(item => [item.id, item]));

const METRICS: Array<{
  key: MetricKey;
  label: string;
  color: string;
  unit: 'ms' | 'count' | 'mb';
  direction: 'lower' | 'higher';
  directionLabel: string;
}> = [
  {
    key: 'jsCommitMs',
    label: 'Commit',
    color: '#2563eb',
    unit: 'ms',
    direction: 'lower',
    directionLabel: 'Lower is better',
  },
  {
    key: 'firstLayoutMs',
    label: 'First Layout',
    color: '#7c3aed',
    unit: 'ms',
    direction: 'lower',
    directionLabel: 'Lower is better',
  },
  {
    key: 'interactionsSettledMs',
    label: 'Settled',
    color: '#0ea5e9',
    unit: 'ms',
    direction: 'lower',
    directionLabel: 'Lower is better',
  },
  {
    key: 'visibleCount',
    label: 'Visible Items',
    color: '#0284c7',
    unit: 'count',
    direction: 'higher',
    directionLabel: 'Higher means more on-screen items',
  },
  {
    key: 'renderedCount',
    label: 'Rendered Items',
    color: '#4338ca',
    unit: 'count',
    direction: 'lower',
    directionLabel: 'Lower is better',
  },
  {
    key: 'prerenderedCount',
    label: 'Prerendered Items',
    color: '#7c3aed',
    unit: 'count',
    direction: 'lower',
    directionLabel: 'Lower is better',
  },
  {
    key: 'jsFrames',
    label: 'JS RAF Frames',
    color: '#059669',
    unit: 'count',
    direction: 'higher',
    directionLabel: 'Higher means JS was able to service more animation frames',
  },
  {
    key: 'jsFrameDrops',
    label: 'JS Frame Drops',
    color: '#dc2626',
    unit: 'count',
    direction: 'lower',
    directionLabel: 'Lower is better',
  },
  {
    key: 'minMemoryMb',
    label: 'Min Memory',
    color: '#f59e0b',
    unit: 'mb',
    direction: 'lower',
    directionLabel: 'Lower is better',
  },
  {
    key: 'maxMemoryMb',
    label: 'Max Memory',
    color: '#f97316',
    unit: 'mb',
    direction: 'lower',
    directionLabel: 'Lower is better',
  },
];

const now = () => globalThis.performance?.now?.() ?? Date.now();
const sleep = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

function markPerf(name: string): void {
  try {
    rnPerformance.mark(name);
  } catch {
    // Metrics are best-effort in development.
  }
}

function measurePerf(name: string, startMark: string, endMark: string): void {
  try {
    rnPerformance.measure(name, startMark, endMark);
  } catch {
    // Ignore missing marks to keep profiling flow resilient.
  }
}

function emitPerfMetric(name: string, value: number): void {
  const metric = (
    rnPerformance as typeof rnPerformance & {
      metric?: (metricName: string, metricValue: number) => void;
    }
  ).metric;
  try {
    metric?.(name, value);
  } catch {
    // Metric emission is optional.
  }
}

type ViewportCounts = {
  visibleCount: number;
  renderedCount: number;
  prerenderedCount: number;
  visibleIds: string[];
  renderedIds: string[];
  prerenderedIds: string[];
};

function deriveViewportCounts(firstVisibleIndex: number): ViewportCounts {
  const safeFirst = Math.max(0, Math.min(firstVisibleIndex, ITEM_COUNT - 1));
  const visibleEnd = Math.min(
    ITEM_COUNT - 1,
    safeFirst + VIEWABILITY_CONFIG.windowSize - 1,
  );
  const renderedStart = Math.max(
    0,
    safeFirst - VIEWABILITY_CONFIG.overscanBefore,
  );
  const renderedEnd = Math.min(
    ITEM_COUNT - 1,
    visibleEnd + VIEWABILITY_CONFIG.overscanAfter,
  );
  const visibleCount = Math.max(0, visibleEnd - safeFirst + 1);
  const renderedCount = Math.max(0, renderedEnd - renderedStart + 1);
  const visibleIds = Array.from(
    { length: visibleCount },
    (_, offset) => DATA[safeFirst + offset]?.id ?? String(safeFirst + offset),
  );
  const renderedIds = Array.from({ length: renderedCount }, (_, offset) => {
    const index = renderedStart + offset;
    return DATA[index]?.id ?? String(index);
  });
  const visibleSet = new Set(visibleIds);
  const prerenderedIds = renderedIds.filter(id => !visibleSet.has(id));

  return {
    visibleCount,
    renderedCount,
    prerenderedCount: Math.max(0, renderedCount - visibleCount),
    visibleIds,
    renderedIds,
    prerenderedIds,
  };
}

const modeLabel = (mode: BenchmarkMode) => {
  if (mode === 'nitro') return 'Our List';
  if (mode === 'flash') return 'FlashList';
  return 'Legend';
};

const emptyStats = (): BenchmarkStatsByMode => ({
  nitro: {},
  flash: {},
  legend: {},
});

const LegendList = (() => {
  try {
    const pkg = require('@legendapp/list/react-native');
    return (pkg.LegendList ?? pkg.default ?? null) as ComponentType<any> | null;
  } catch {
    return null;
  }
})();

function readUsedMemoryMb(): number | undefined {
  const perf = globalThis.performance as Performance & {
    memory?: { usedJSHeapSize?: number };
  };
  const used = perf.memory?.usedJSHeapSize;
  if (typeof used !== 'number') return undefined;
  return used / (1024 * 1024);
}

type NitroTemplateProps = {
  height?: number;
  id: string;
  index: number;
  text?: string;
};

function ListItemCard({
  promo,
  height,
  id,
  text,
}: {
  promo: boolean;
  height?: number;
  id: string;
  text?: string;
}) {
  return (
    <View
      className={`mx-3 my-1.5 flex-row items-center rounded-2xl border px-3 ${promo ? 'border-amber-300 bg-amber-100' : 'border-border bg-surface-elevated'}`}
      style={{ minHeight: height ?? (promo ? 82 : 72) }}
    >
      <Text
        className={`flex-1 text-sm font-bold ${promo ? 'text-amber-950' : 'text-on-surface'}`}
      >
        {text}
      </Text>
      <Text className={`text-xs ${promo ? 'text-amber-700' : 'text-muted'}`}>
        {id}
      </Text>
    </View>
  );
}

function ChatRow({ height, id, text }: NitroTemplateProps) {
  return <ListItemCard promo={false} height={height} id={id} text={text} />;
}

function PromoRow({ height, id, text }: NitroTemplateProps) {
  return <ListItemCard promo height={height} id={id} text={text} />;
}

const Row = memo(function Row({ item }: { item: BenchmarkItem }) {
  const promo = item.template === 'promo';
  return (
    <ListItemCard
      promo={promo}
      height={item.props.height}
      id={item.id}
      text={item.props.text}
    />
  );
});

function formatMetricValue(
  value: number | undefined,
  unit: 'ms' | 'count' | 'mb',
) {
  if (value == null) return 'pending';
  if (unit === 'count') return String(Math.round(value));
  return `${value.toFixed(1)}${unit}`;
}

function MetricComparisonGraph({
  chartKind,
  metric,
  onChartKindChange,
  onMetricChange,
  statsByMode,
}: {
  chartKind: ChartKind;
  metric: (typeof METRICS)[number];
  onChartKindChange: (chartKind: ChartKind) => void;
  onMetricChange: (metric: MetricKey) => void;
  statsByMode: BenchmarkStatsByMode;
}) {
  const metricKey = metric.key as MetricKey;
  const entries: Array<{ mode: BenchmarkMode; value: number }> = [
    { mode: 'nitro', value: statsByMode.nitro[metricKey] ?? 0 },
    { mode: 'flash', value: statsByMode.flash[metricKey] ?? 0 },
    { mode: 'legend', value: statsByMode.legend[metricKey] ?? 0 },
  ];

  const chartData = entries.map((entry, index) => ({
    value: entry.value,
    label: index === 0 ? 'Our' : index === 1 ? 'Flash' : 'Legend',
    frontColor: index === 0 ? '#2563eb' : index === 1 ? '#7c3aed' : '#059669',
  }));

  const lineData = entries.map((entry, index) => ({
    value: entry.value,
    label: index === 0 ? 'Our' : index === 1 ? 'Flash' : 'Legend',
    dataPointColor:
      index === 0 ? '#2563eb' : index === 1 ? '#7c3aed' : '#059669',
  }));

  const hasAnyData = entries.some(entry => entry.value > 0);
  const bestValue = hasAnyData
    ? metric.direction === 'lower'
      ? Math.min(
          ...entries.filter(entry => entry.value > 0).map(entry => entry.value),
        )
      : Math.max(...entries.map(entry => entry.value))
    : 0;

  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface-elevated p-4">
      <View className="gap-1">
        <Text className="text-sm font-extrabold text-on-surface">
          {metric.label}
        </Text>
        <Text className="text-xs font-semibold text-muted">
          {metric.directionLabel}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2 pr-2">
          {METRICS.map(option => {
            const selected = option.key === metric.key;
            return (
              <Pressable
                key={option.key}
                className={`rounded-full border px-3 py-1.5 ${
                  selected
                    ? 'border-primary bg-primary'
                    : 'border-border bg-surface'
                }`}
                onPress={() => onMetricChange(option.key)}
              >
                <Text
                  className={`text-xs font-bold ${
                    selected ? 'text-primary-foreground' : 'text-on-surface'
                  }`}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View className="flex-row gap-2">
        {(['bar', 'line'] as const).map(kind => {
          const selected = kind === chartKind;
          return (
            <Pressable
              key={kind}
              className={`rounded-xl border px-3 py-2 ${
                selected
                  ? 'border-primary bg-primary'
                  : 'border-border bg-surface'
              }`}
              onPress={() => onChartKindChange(kind)}
            >
              <Text
                className={`text-xs font-bold capitalize ${
                  selected ? 'text-primary-foreground' : 'text-on-surface'
                }`}
              >
                {kind}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {hasAnyData ? (
        chartKind === 'bar' ? (
          <BarChart
            data={chartData}
            barWidth={30}
            spacing={26}
            initialSpacing={8}
            endSpacing={8}
            noOfSections={4}
            hideYAxisText
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor="#cfd6e4"
            hideRules
            disableScroll
            maxValue={Math.max(...entries.map(entry => entry.value), 1)}
            height={150}
            isAnimated
            animationDuration={280}
          />
        ) : (
          <LineChart
            data={lineData}
            color={metric.color}
            dataPointsColor={metric.color}
            thickness={3}
            spacing={70}
            initialSpacing={18}
            endSpacing={18}
            noOfSections={4}
            hideYAxisText
            yAxisThickness={0}
            xAxisThickness={1}
            xAxisColor="#cfd6e4"
            hideRules
            height={150}
            isAnimated
            animationDuration={280}
          />
        )
      ) : (
        <Text className="text-xs text-muted">
          Run benchmark to populate chart.
        </Text>
      )}

      <View className="gap-1">
        {entries.map(entry => {
          const hasValue = entry.value > 0;
          const best = hasAnyData && hasValue && entry.value === bestValue;
          return (
            <View
              key={entry.mode}
              className="flex-row items-center justify-between"
            >
              <Text className="text-xs font-semibold text-on-surface">
                {modeLabel(entry.mode)}
              </Text>
              <Text className="text-xs text-muted">
                {formatMetricValue(
                  hasValue ? entry.value : undefined,
                  metric.unit,
                )}
                {best ? ' · best' : ''}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StatCard({
  mode,
  stats,
}: {
  mode: BenchmarkMode;
  stats: BenchmarkStats;
}) {
  const commit =
    stats.jsCommitMs == null ? 'pending' : `${stats.jsCommitMs.toFixed(1)}ms`;
  const layout =
    stats.firstLayoutMs == null
      ? 'pending'
      : `${stats.firstLayoutMs.toFixed(1)}ms`;
  const settled =
    stats.interactionsSettledMs == null
      ? 'pending'
      : `${stats.interactionsSettledMs.toFixed(1)}ms`;
  const mem =
    stats.maxMemoryMb == null ? 'pending' : `${stats.maxMemoryMb.toFixed(1)}MB`;
  const visible =
    stats.visibleCount == null ? 'pending' : String(stats.visibleCount);
  const rendered =
    stats.renderedCount == null ? 'pending' : String(stats.renderedCount);
  const prerendered =
    stats.prerenderedCount == null ? 'pending' : String(stats.prerenderedCount);

  return (
    <View className="rounded-xl border border-border bg-surface-elevated p-3">
      <Text className="text-xs font-bold uppercase text-muted">
        {modeLabel(mode)}
      </Text>
      <Text className="text-xs text-on-surface">
        commit {commit} | first rows {layout} | settled {settled} | max mem{' '}
        {mem}
      </Text>
      <Text className="text-xs text-on-surface">
        visible {visible} | rendered {rendered} | prerendered {prerendered}
      </Text>
    </View>
  );
}

function HtmlRenderSnapshot({
  mode,
  stats,
}: {
  mode: BenchmarkMode;
  stats: BenchmarkStats;
}) {
  const visibleIds = stats.visibleIds ?? [];
  const renderedIds = stats.renderedIds ?? [];
  const prerenderedIds = stats.prerenderedIds ?? [];

  const renderNodeList = (ids: string[]) =>
    ids.length === 0 ? (
      <Text className="text-xs text-muted"> none</Text>
    ) : (
      ids.map(id => (
        <Text key={id} className="text-xs text-on-surface">
          {`  <item id="${id}" />`}
        </Text>
      ))
    );

  return (
    <View className="gap-2 rounded-2xl border border-border bg-surface-elevated p-4">
      <Text className="text-sm font-extrabold text-on-surface">
        Rozenite Submodule: HTML Render Snapshot ({modeLabel(mode)})
      </Text>
      <Text className="text-xs text-muted">
        Shows what is currently visible, rendered, and prerendered.
      </Text>

      <ScrollView className="max-h-64 rounded-xl border border-border bg-surface px-3 py-2">
        <Text className="text-xs text-on-surface">{`<list mode="${mode}">`}</Text>
        <Text className="text-xs text-on-surface"> {'<visible>'}</Text>
        {renderNodeList(visibleIds)}
        <Text className="text-xs text-on-surface"> {'</visible>'}</Text>

        <Text className="mt-1 text-xs text-on-surface"> {'<rendered>'}</Text>
        {renderNodeList(renderedIds)}
        <Text className="text-xs text-on-surface"> {'</rendered>'}</Text>

        <Text className="mt-1 text-xs text-on-surface"> {'<prerendered>'}</Text>
        {renderNodeList(prerenderedIds)}
        <Text className="text-xs text-on-surface"> {'</prerendered>'}</Text>
        <Text className="text-xs text-on-surface">{'</list>'}</Text>
      </ScrollView>
    </View>
  );
}

function NitroListInspector({
  mode,
  stats,
}: {
  mode: BenchmarkMode;
  stats: BenchmarkStats;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const renderedIds = stats.renderedIds ?? [];
  const visibleIds = stats.visibleIds ?? [];
  const prerenderedIds = stats.prerenderedIds ?? [];

  useEffect(() => {
    if (renderedIds.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId == null || !renderedIds.includes(selectedId)) {
      setSelectedId(renderedIds[0]!);
    }
  }, [renderedIds, selectedId]);

  const selectedItem =
    selectedId == null
      ? null
      : (DATA.find(item => item.id === selectedId) ?? null);

  const renderIdGroup = (title: string, ids: string[]) => (
    <View className="gap-1">
      <Text className="text-xs font-bold text-muted">{title}</Text>
      {ids.length === 0 ? (
        <Text className="text-xs text-muted">none</Text>
      ) : (
        ids.map(id => {
          const selected = id === selectedId;
          return (
            <Pressable
              key={`${title}-${id}`}
              className={`rounded-lg border px-2 py-1 ${selected ? 'border-primary bg-primary' : 'border-border bg-surface'}`}
              onPress={() => setSelectedId(id)}
            >
              <Text
                className={`text-xs font-semibold ${selected ? 'text-primary-foreground' : 'text-on-surface'}`}
              >
                {id}
              </Text>
            </Pressable>
          );
        })
      )}
    </View>
  );

  return (
    <View className="gap-2 rounded-2xl border border-border bg-surface-elevated p-4">
      <Text className="text-sm font-extrabold text-on-surface">
        NitroList Tab: Rendered IDs + HTML Layout ({modeLabel(mode)})
      </Text>
      <Text className="text-xs text-muted">
        Select a rendered item ID to inspect its HTML-style layout payload.
      </Text>

      <View className="flex-row gap-3">
        <ScrollView className="max-h-72 min-w-[120] flex-1 rounded-xl border border-border bg-surface px-2 py-2">
          {renderIdGroup('visible', visibleIds)}
          <View className="h-2" />
          {renderIdGroup('rendered', renderedIds)}
          <View className="h-2" />
          {renderIdGroup('prerendered', prerenderedIds)}
        </ScrollView>

        <ScrollView className="max-h-72 flex-[1.4] rounded-xl border border-border bg-surface px-3 py-2">
          {selectedItem == null ? (
            <Text className="text-xs text-muted">No item selected.</Text>
          ) : (
            <>
              <Text className="text-xs text-on-surface">{`<item id="${selectedItem.id}">`}</Text>
              <Text className="text-xs text-on-surface">{`  <template>${selectedItem.template}</template>`}</Text>
              <Text className="text-xs text-on-surface">{`  <layout height="auto" />`}</Text>
              <Text className="text-xs text-on-surface">{`  <text>${selectedItem.props.text}</text>`}</Text>
              <Text className="text-xs text-on-surface">{'</item>'}</Text>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

export default function Profiling() {
  const [runId, setRunId] = useState(0);
  const [activeMode, setActiveMode] = useState<BenchmarkMode>('nitro');
  const [statsByMode, setStatsByMode] =
    useState<BenchmarkStatsByMode>(emptyStats);
  const [nitroHandle, setNitroHandle] = useState<number | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('jsCommitMs');
  const [chartKind, setChartKind] = useState<ChartKind>('bar');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('overview');
  const [sequenceModalOpen, setSequenceModalOpen] = useState(false);
  const [sequenceRunning, setSequenceRunning] = useState(false);
  const [sequenceStep, setSequenceStep] = useState(0);
  const [sequenceMessage, setSequenceMessage] = useState('idle');

  const startedAt = useRef(0);
  const firstLayoutCaptured = useRef(false);
  const interactionToken = useRef(0);
  const sequenceToken = useRef(0);
  const nitroHandleRef = useRef<number | null>(null);
  const flashRef = useRef<any>(null);
  const legendRef = useRef<any>(null);
  const flashFirstVisibleRef = useRef(0);
  const legendFirstVisibleRef = useRef(0);
  const runLabelByModeRef = useRef<Record<BenchmarkMode, string>>({
    nitro: '',
    flash: '',
    legend: '',
  });
  const lastRozeniteSnapshotKeyRef = useRef('');
  const rozeniteSnapshotRef = useRef<NitroListInspectorSnapshot | null>(null);
  const rozeniteSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const nativeAvailable = NitroList.isNativeAvailable();
  const nitroNativeHandleRef = useMemo<NativeHandleRef>(
    () => ({
      getHandle() {
        return nitroHandleRef.current;
      },
      scrollToIndex(index: number, animated: boolean = true) {
        const handle = nitroHandleRef.current;
        if (handle == null) {
          return false;
        }
        NitroList.scrollToIndex(handle, index, animated);
        return true;
      },
      update() {
        return false;
      },
      dispose() {
        const handle = nitroHandleRef.current;
        if (handle != null) {
          NitroList.dispose(handle);
        }
        nitroHandleRef.current = null;
      },
    }),
    [],
  );
  const nitroNativeViewability = useNitroListViewability(
    nitroNativeHandleRef,
    DATA.length,
    { ...VIEWABILITY_CONFIG, eventThrottleMs: 120 },
  );
  const nitroInspectorClient =
    useRozeniteDevToolsClient<NitroListInspectorEventMap>({
      pluginId: '@nitrowind/nitrolist-rozenite-plugin',
    });
  const metric =
    METRICS.find(candidate => candidate.key === selectedMetric) ?? METRICS[0]!;

  useEffect(() => {
    if (nitroInspectorClient == null) {
      return;
    }

    const stats = statsByMode[activeMode];
    const renderedIds = stats.renderedIds ?? [];
    const visibleIds = stats.visibleIds ?? [];
    const prerenderedIds = stats.prerenderedIds ?? [];
    const snapshotKey = [
      activeMode,
      visibleIds.join(','),
      renderedIds.join(','),
      prerenderedIds.join(','),
      stats.jsCommitMs?.toFixed(1) ?? '',
      stats.firstLayoutMs?.toFixed(1) ?? '',
      stats.interactionsSettledMs?.toFixed(1) ?? '',
      stats.jsFrames ?? '',
      stats.jsFrameDrops ?? '',
      stats.minMemoryMb?.toFixed(1) ?? '',
      stats.maxMemoryMb?.toFixed(1) ?? '',
    ].join('|');

    if (snapshotKey === lastRozeniteSnapshotKeyRef.current) {
      return;
    }

    lastRozeniteSnapshotKeyRef.current = snapshotKey;
    const renderedItems = renderedIds
      .map(id => DATA_BY_ID.get(id))
      .filter((item): item is BenchmarkItem => item != null)
      .map(item => ({
        id: item.id,
        template: item.template,
        text: item.props.text,
        height: item.props.height ?? null,
      }));

    rozeniteSnapshotRef.current = {
      mode: activeMode,
      visibleIds,
      renderedIds,
      prerenderedIds,
      visibleCount: stats.visibleCount ?? 0,
      renderedCount: stats.renderedCount ?? 0,
      prerenderedCount: stats.prerenderedCount ?? 0,
      jsCommitMs: stats.jsCommitMs ?? null,
      firstLayoutMs: stats.firstLayoutMs ?? null,
      interactionsSettledMs: stats.interactionsSettledMs ?? null,
      jsFrames: stats.jsFrames ?? null,
      jsFrameDrops: stats.jsFrameDrops ?? null,
      uiFrames: stats.uiFrames ?? null,
      uiFrameDrops: stats.uiFrameDrops ?? null,
      minMemoryMb: stats.minMemoryMb ?? null,
      maxMemoryMb: stats.maxMemoryMb ?? null,
      renderedItems,
    };

    if (rozeniteSendTimerRef.current != null) {
      return;
    }

    rozeniteSendTimerRef.current = setTimeout(() => {
      rozeniteSendTimerRef.current = null;
      const snapshot = rozeniteSnapshotRef.current;
      if (snapshot != null) {
        nitroInspectorClient.send('setSnapshot', snapshot);
      }
    }, 80);
  }, [activeMode, nitroInspectorClient, statsByMode]);

  useEffect(() => {
    return () => {
      if (rozeniteSendTimerRef.current != null) {
        clearTimeout(rozeniteSendTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    NitroList.registerTemplates({
      chat: ChatRow,
      promo: PromoRow,
    });
  }, []);

  useEffect(() => {
    nitroHandleRef.current = nitroHandle;
    void nitroNativeViewability.refresh();
  }, [nitroHandle, nitroNativeViewability.refresh]);

  useEffect(() => {
    if (activeMode !== 'nitro') {
      setNitroHandle(current => {
        if (current != null) NitroList.dispose(current);
        return null;
      });
      return;
    }

    let cancelled = false;
    let createdHandle: number | null = null;

    const createNativeList = async () => {
      const handle = await NitroList.createList(DATA, {
        estimatedItemHeight: 76,
        overscanScreens: 1,
        paginationConfig: {
          initialIndex: 0,
          snapEveryItems: 50,
        },
        viewabilityConfig: VIEWABILITY_CONFIG,
      });

      if (cancelled) {
        NitroList.dispose(handle);
        return;
      }

      createdHandle = handle;
      setNitroHandle(current => {
        if (current != null) NitroList.dispose(current);
        return handle;
      });
    };

    createNativeList().catch(() => {
      setNitroHandle(null);
    });

    return () => {
      cancelled = true;
      if (createdHandle != null) {
        NitroList.dispose(createdHandle);
      }
      setNitroHandle(current => (current === createdHandle ? null : current));
    };
  }, [activeMode, runId]);

  useEffect(() => {
    return () => {
      setNitroHandle(current => {
        if (current != null) NitroList.dispose(current);
        return null;
      });
    };
  }, []);

  const updateModeStat = useCallback(
    (mode: BenchmarkMode, patch: Partial<BenchmarkStats>) => {
      setStatsByMode(current => ({
        ...current,
        [mode]: {
          ...current[mode],
          ...patch,
        },
      }));
    },
    [],
  );

  const captureFirstListRender = useCallback(
    (mode: BenchmarkMode) => {
      if (firstLayoutCaptured.current || startedAt.current === 0) return;
      firstLayoutCaptured.current = true;
      const firstLayoutMs = now() - startedAt.current;
      updateModeStat(mode, { firstLayoutMs });

      const runLabel = runLabelByModeRef.current[mode];
      if (runLabel.length > 0) {
        markPerf(`${runLabel}.firstListRowsVisible`);
        measurePerf(
          `${runLabel}.timeToFirstListRowsVisible`,
          `${runLabel}.start`,
          `${runLabel}.firstListRowsVisible`,
        );
        emitPerfMetric(`${runLabel}.firstLayoutMs`, firstLayoutMs);
      }
    },
    [updateModeStat],
  );

  useEffect(() => {
    if (activeMode !== 'nitro') {
      return;
    }

    const viewability = nitroNativeViewability.viewability;
    updateModeStat('nitro', {
      visibleCount: viewability.visibleIndices.length,
      renderedCount: viewability.renderedIndices.length,
      prerenderedCount: viewability.outsideViewportIndices.length,
      visibleIds: viewability.visibleIds,
      renderedIds: viewability.renderedIds,
      prerenderedIds: viewability.outsideViewportIds,
    });
    if (viewability.visibleIndices.length > 0) {
      captureFirstListRender('nitro');
    }
  }, [
    activeMode,
    captureFirstListRender,
    nitroNativeViewability.viewability,
    updateModeStat,
  ]);

  const waitForNitroHandle = useCallback(async () => {
    const started = now();
    while (now() - started < 5000) {
      if (nitroHandleRef.current != null) return nitroHandleRef.current;
      await sleep(40);
    }
    return null;
  }, []);

  const sampleJsFrames = useCallback((durationMs: number) => {
    let rafId = 0;
    let running = true;
    let last = 0;
    let started = 0;
    let ended = 0;
    let frames = 0;
    let gapDrops = 0;
    let minMemory = Number.POSITIVE_INFINITY;
    let maxMemory = 0;

    return new Promise<Partial<BenchmarkStats>>(resolve => {
      const finish = () => {
        if (!running) {
          return;
        }
        running = false;
        cancelAnimationFrame(rafId);
        const elapsed = Math.max(0, ended - started);
        const expectedFrames = Math.max(0, Math.floor(elapsed / 16.67));
        resolve({
          jsFrames: frames,
          jsFrameDrops: Math.max(0, expectedFrames - frames, gapDrops),
          uiFrames: undefined,
          uiFrameDrops: undefined,
          minMemoryMb: Number.isFinite(minMemory) ? minMemory : undefined,
          maxMemoryMb: maxMemory > 0 ? maxMemory : undefined,
        });
      };

      const tick = (ts: number) => {
        if (!running) return;
        if (started === 0) {
          started = ts;
        }
        ended = ts;
        if (last > 0) {
          const delta = ts - last;
          frames += 1;
          const expected = Math.max(1, Math.round(delta / 16.67));
          gapDrops += Math.max(0, expected - 1);
        }
        last = ts;

        const mem = readUsedMemoryMb();
        if (mem != null) {
          minMemory = Math.min(minMemory, mem);
          maxMemory = Math.max(maxMemory, mem);
        }

        if (ts - started >= durationMs) {
          finish();
          return;
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
      setTimeout(finish, durationMs + 120);
    });
  }, []);

  const autoScrollForMode = useCallback(async (mode: BenchmarkMode) => {
    if (mode === 'nitro') {
      const handle = nitroHandleRef.current;
      if (handle != null) {
        NitroList.scrollToIndex(handle, AUTO_SCROLL_INDEX, true);
      }
      return;
    }

    if (mode === 'flash') {
      flashFirstVisibleRef.current = AUTO_SCROLL_INDEX;
      flashRef.current?.scrollToIndex?.({
        index: AUTO_SCROLL_INDEX,
        animated: true,
      });
      return;
    }

    legendFirstVisibleRef.current = AUTO_SCROLL_INDEX;
    legendRef.current?.scrollToIndex?.({
      index: AUTO_SCROLL_INDEX,
      animated: true,
    });
  }, []);

  const readViewportCounts = useCallback(
    async (mode: BenchmarkMode): Promise<ViewportCounts> => {
      if (mode === 'nitro') {
        const handle = nitroHandleRef.current;
        if (handle != null) {
          const viewability = await NitroList.getViewability(
            handle,
            VIEWABILITY_CONFIG,
          );
          if (viewability != null) {
            return {
              visibleCount: viewability.visibleIndices.length,
              renderedCount: viewability.renderedIndices.length,
              prerenderedCount: viewability.outsideViewportIndices.length,
              visibleIds: viewability.visibleIds,
              renderedIds: viewability.renderedIds,
              prerenderedIds: viewability.outsideViewportIds,
            };
          }
        }
      }

      const fallbackIndex =
        mode === 'flash'
          ? flashFirstVisibleRef.current
          : legendFirstVisibleRef.current;
      return deriveViewportCounts(fallbackIndex);
    },
    [],
  );

  const runBenchmark = useCallback(
    async (mode: BenchmarkMode, options?: { autoScroll?: boolean }) => {
      const runLabel = `profiling.${mode}.${Date.now()}`;
      runLabelByModeRef.current[mode] = runLabel;
      startedAt.current = 0;
      firstLayoutCaptured.current = true;
      interactionToken.current += 1;
      const token = interactionToken.current;

      setActiveMode(mode);
      setStatsByMode(current => ({
        ...current,
        [mode]: {},
      }));
      setRunId(current => current + 1);

      if (mode === 'nitro') {
        await waitForNitroHandle();
      } else {
        await sleep(220);
      }

      await sleep(120);

      const measuredStartedAt = now();
      startedAt.current = measuredStartedAt;
      firstLayoutCaptured.current = false;
      markPerf(`${runLabel}.start`);
      updateModeStat(mode, { jsCommitMs: 0 });
      requestAnimationFrame(() => {
        const commitMs = now() - measuredStartedAt;
        updateModeStat(mode, { jsCommitMs: commitMs });
        emitPerfMetric(`${runLabel}.jsCommitMs`, commitMs);
      });

      const initialViewport = await readViewportCounts(mode);
      if (initialViewport.visibleCount > 0) {
        captureFirstListRender(mode);
      }

      const frameSample = sampleJsFrames(FRAME_SAMPLE_MS);
      if (options?.autoScroll) {
        await autoScrollForMode(mode);
      }

      await new Promise<void>(resolve => {
        InteractionManager.runAfterInteractions(() => {
          if (token !== interactionToken.current) {
            resolve();
            return;
          }
          const settledMs = now() - measuredStartedAt;
          updateModeStat(mode, { interactionsSettledMs: settledMs });
          emitPerfMetric(`${runLabel}.interactionsSettledMs`, settledMs);
          resolve();
        });
      });

      const sampled = await frameSample;
      updateModeStat(mode, sampled);

      const viewport = await readViewportCounts(mode);
      updateModeStat(mode, viewport);
      emitPerfMetric(`${runLabel}.visibleCount`, viewport.visibleCount);
      emitPerfMetric(`${runLabel}.renderedCount`, viewport.renderedCount);
      emitPerfMetric(`${runLabel}.prerenderedCount`, viewport.prerenderedCount);

      markPerf(`${runLabel}.end`);
      measurePerf(`${runLabel}.total`, `${runLabel}.start`, `${runLabel}.end`);
    },
    [
      autoScrollForMode,
      captureFirstListRender,
      readViewportCounts,
      sampleJsFrames,
      updateModeStat,
      waitForNitroHandle,
    ],
  );

  const selectTab = useCallback(
    (mode: BenchmarkMode) => {
      setSequenceModalOpen(true);
      setSequenceRunning(true);
      setSequenceStep(MODE_SEQUENCE.indexOf(mode) + 1);
      setSequenceMessage(
        `Running ${modeLabel(mode)}: mount -> scroll -> measure`,
      );
      void (async () => {
        await runBenchmark(mode, { autoScroll: true });
        setSequenceRunning(false);
        setSequenceMessage('Single mode complete. Review metrics below.');
      })();
    },
    [runBenchmark],
  );

  const onFlashViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const indices = viewableItems
        .map(item => item.index)
        .filter((value): value is number => typeof value === 'number');
      if (indices.length > 0) {
        flashFirstVisibleRef.current = Math.min(...indices);
        captureFirstListRender('flash');
      }
    },
    [captureFirstListRender],
  );

  const onLegendVisibleIndicesChanged = useCallback(
    (indices: number[]) => {
      if (Array.isArray(indices) && indices.length > 0) {
        legendFirstVisibleRef.current = Math.min(...indices);
        captureFirstListRender('legend');
      }
    },
    [captureFirstListRender],
  );

  const runAll = useCallback(async () => {
    const token = sequenceToken.current + 1;
    sequenceToken.current = token;

    setSequenceModalOpen(true);
    setSequenceRunning(true);
    setSequenceMessage('Starting flow...');

    for (let i = 0; i < MODE_SEQUENCE.length; i += 1) {
      if (sequenceToken.current !== token) break;
      const mode = MODE_SEQUENCE[i]!;
      setSequenceStep(i + 1);
      setSequenceMessage(
        `Running ${modeLabel(mode)}: mount -> scroll -> measure`,
      );
      await runBenchmark(mode, { autoScroll: true });
      await sleep(500);
    }

    if (sequenceToken.current === token) {
      setSequenceMessage('Sequence complete. Review graphs below.');
    }

    setSequenceRunning(false);
  }, [runBenchmark]);

  const closeSequenceModal = useCallback(() => {
    sequenceToken.current += 1;
    setSequenceRunning(false);
    setSequenceModalOpen(false);
  }, []);

  const renderListSurface = useCallback(() => {
    return (
      <NativeView key={`${activeMode}-${runId}`} style={styles.surface}>
        {activeMode === 'nitro' ? (
          nitroHandle == null ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-sm text-muted">
                Creating Nitro handle...
              </Text>
            </View>
          ) : (
            <FlashList
              ref={flashRef}
              data={DATA}
              drawDistance={FLASHLIST_DRAW_DISTANCE}
              getItemType={item => item.template}
              keyExtractor={item => item.id}
              maintainVisibleContentPosition={{ disabled: true }}
              onViewableItemsChanged={onFlashViewableItemsChanged}
              renderItem={({ item }) => <Row item={item} />}
            />
          )
        ) : activeMode === 'flash' ? (
          <FlashList
            ref={flashRef}
            data={DATA}
            drawDistance={FLASHLIST_DRAW_DISTANCE}
            getItemType={item => item.template}
            keyExtractor={item => item.id}
            maintainVisibleContentPosition={{ disabled: true }}
            onViewableItemsChanged={onFlashViewableItemsChanged}
            renderItem={({ item }) => <Row item={item} />}
          />
        ) : LegendList == null ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-sm text-muted">
              Legend List package is unavailable.
            </Text>
          </View>
        ) : (
          <LegendList
            ref={legendRef}
            data={DATA}
            keyExtractor={(item: BenchmarkItem) => item.id}
            onVisibleIndicesChanged={onLegendVisibleIndicesChanged}
            renderItem={({ item }: { item: BenchmarkItem }) => (
              <Row item={item} />
            )}
          />
        )}
      </NativeView>
    );
  }, [
    activeMode,
    nitroHandle,
    nitroNativeViewability.onViewabilityChange,
    runId,
  ]);

  return (
    <View className="flex-1 bg-surface">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 px-safe-or-4 pb-safe-offset-8 pt-4"
      >
        <Section
          title="NitroList vs FlashList vs Legend"
          subtitle="Tap a mode to profile it in the modal surface only, or run all modes in sequence."
        >
          <View className="gap-3">
            <View className="rounded-2xl border border-border bg-surface-elevated p-4">
              <Text className="text-sm text-muted">
                Native Nitro module available: {nativeAvailable ? 'yes' : 'no'}
              </Text>
              <Text className="text-sm text-muted">
                Active mode: {modeLabel(activeMode)}
              </Text>
            </View>

            <View className="flex-row gap-2">
              {MODE_SEQUENCE.map(mode => (
                <Pressable
                  key={mode}
                  className={`flex-1 rounded-xl px-3 py-2 ${activeMode === mode ? 'bg-primary' : 'bg-surface-elevated border border-border'}`}
                  onPress={() => selectTab(mode)}
                >
                  <Text
                    className={`text-center text-sm font-bold ${activeMode === mode ? 'text-primary-foreground' : 'text-on-surface'}`}
                  >
                    {modeLabel(mode)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              className="rounded-xl border border-border px-3 py-2"
              onPress={runAll}
            >
              <Text className="text-center text-sm font-semibold text-on-surface">
                Run All Flow (Modal Sequence)
              </Text>
            </Pressable>

            <StatCard mode="nitro" stats={statsByMode.nitro} />
            <StatCard mode="flash" stats={statsByMode.flash} />
            <StatCard mode="legend" stats={statsByMode.legend} />

            <MetricComparisonGraph
              chartKind={chartKind}
              metric={metric}
              onChartKindChange={setChartKind}
              onMetricChange={setSelectedMetric}
              statsByMode={statsByMode}
            />

            <View className="gap-2 rounded-2xl border border-border bg-surface-elevated p-3">
              <View className="flex-row gap-2">
                <Pressable
                  className={`rounded-xl px-3 py-2 ${inspectorTab === 'overview' ? 'bg-primary' : 'border border-border bg-surface'}`}
                  onPress={() => setInspectorTab('overview')}
                >
                  <Text
                    className={`text-xs font-bold ${inspectorTab === 'overview' ? 'text-primary-foreground' : 'text-on-surface'}`}
                  >
                    Overview Snapshot
                  </Text>
                </Pressable>

                <Pressable
                  className={`rounded-xl px-3 py-2 ${inspectorTab === 'nitrolist' ? 'bg-primary' : 'border border-border bg-surface'}`}
                  onPress={() => setInspectorTab('nitrolist')}
                >
                  <Text
                    className={`text-xs font-bold ${inspectorTab === 'nitrolist' ? 'text-primary-foreground' : 'text-on-surface'}`}
                  >
                    NitroList Tab
                  </Text>
                </Pressable>
              </View>

              {inspectorTab === 'overview' ? (
                <HtmlRenderSnapshot
                  mode={activeMode}
                  stats={statsByMode[activeMode]}
                />
              ) : (
                <NitroListInspector
                  mode={activeMode}
                  stats={statsByMode[activeMode]}
                />
              )}
            </View>

            <View className="rounded-2xl border border-border bg-surface-elevated p-4">
              <Text className="text-xs text-muted">
                List surfaces render only inside the profiling modal to avoid
                page-level noise.
              </Text>
            </View>
          </View>
        </Section>
      </ScrollView>

      <Modal
        visible={sequenceModalOpen}
        animationType="slide"
        onRequestClose={closeSequenceModal}
      >
        <View style={{ paddingTop: 80, flex: 1 }} className=" bg-surface">
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <Text className="text-base font-extrabold text-on-surface">
              Run All Sequence
            </Text>
            <Pressable
              className="rounded-lg border border-border px-3 py-1.5"
              onPress={closeSequenceModal}
            >
              <Text className="text-sm font-semibold text-on-surface">
                {sequenceRunning ? 'Stop' : 'Close'}
              </Text>
            </Pressable>
          </View>

          <View className="gap-1 border-b border-border px-4 py-3">
            <Text className="text-sm font-semibold text-on-surface">
              Step {sequenceStep}/{MODE_SEQUENCE.length}
            </Text>
            <Text className="text-xs text-muted">{sequenceMessage}</Text>
          </View>

          <View className="px-4 py-3">
            <View className="h-[520] overflow-hidden rounded-2xl border border-border bg-white">
              {renderListSurface()}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  surface: {
    flex: 1,
    overflow: 'hidden',
  },
});
