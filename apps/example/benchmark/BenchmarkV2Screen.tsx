import {
  Pressable as RNPressable,
  StyleSheet,
  Text as RNText,
  View as RNView,
} from 'react-native';
import { ScrollView, Text, View } from '@nitrofoundation/nitrowind';
import {
  BENCHMARK_CONFIG,
  formatMs,
  useBenchmarkV2,
  type BenchmarkImplementation,
  type BenchmarkResult,
  type BenchmarkScenario,
} from './index';

const stylesheetPalette = {
  light: { background: '#ffffff', card: '#6d28d9', text: '#111827' },
  dark: { background: '#0b1020', card: '#a78bfa', text: '#f9fafb' },
};

function ResultCard({ result }: { result: BenchmarkResult }) {
  return (
    <View
      className={`rounded-xl border p-3 ${
        result.valid
          ? 'border-border bg-surface-elevated'
          : 'border-red-500 bg-red-950'
      }`}
    >
      <Text className="text-sm font-bold text-on-surface">
        {result.scenario === 'mount' ? 'Grid remount' : 'Theme switch'}
      </Text>
      <View className="mt-2 flex-row flex-wrap gap-x-4 gap-y-1">
        <Text className="text-xs text-muted">Median {formatMs(result.median)}</Text>
        <Text className="text-xs text-muted">p95 {formatMs(result.p95)}</Text>
        <Text className="text-xs text-muted">Avg {formatMs(result.average)}</Text>
        <Text className="text-xs text-muted">σ {formatMs(result.stdDev)}</Text>
      </View>
      <Text className="mt-2 text-xs font-semibold text-on-surface">
        React renders during measurement: {result.reactRenders}
      </Text>
      {!result.valid ? (
        <View className="mt-2 gap-1">
          <Text className="text-xs font-extrabold text-red-300">
            INVALID BENCHMARK
          </Text>
          {result.validationIssues.map(issue => (
            <Text key={issue} className="text-xs text-red-200">
              • {issue}
            </Text>
          ))}
        </View>
      ) : null}
      {result.nativeDiagnostics?.nativeAvailable ? (
        <View className="mt-2 gap-1 border-t border-border pt-2">
          <Text className="text-xs font-semibold text-on-surface">
            Native resolver {formatMs(result.nativeDiagnostics.totalResolveDurationMs)}
            {' · '}commit {formatMs(result.nativeDiagnostics.totalCommitDurationMs)}
          </Text>
          <Text className="text-xs text-muted">
            {result.nativeDiagnostics.resolvedNodes} resolved ·{' '}
            {result.nativeDiagnostics.skippedMutations} unchanged skipped ·{' '}
            {result.nativeDiagnostics.committedMutations} committed
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function BenchmarkStatus({
  implementation,
  activeScenario,
}: {
  implementation: BenchmarkImplementation;
  activeScenario: BenchmarkScenario | null;
}) {
  return (
    <View className="rounded-xl bg-gray p-4">
      <Text className="text-center text-base font-bold text-typography">
        {activeScenario
          ? `Running ${activeScenario === 'mount' ? 'grid remount' : 'theme switch'}…`
          : 'Benchmark v2 complete'}
      </Text>
      <Text className="mt-1 text-center text-xs text-typography">
        {implementation === 'nitrowind' ? 'NitroWind' : 'StyleSheet'} ·{' '}
        {BENCHMARK_CONFIG.ITEMS_COUNT} cards · {BENCHMARK_CONFIG.WARMUP_RUNS}{' '}
        warmups · {BENCHMARK_CONFIG.RUNS} measured runs
      </Text>
      {activeScenario ? (
        <Text className="mt-1 text-center text-xs text-typography">
          Recording {BENCHMARK_CONFIG.RUNS} runs without progress UI renders
        </Text>
      ) : null}
    </View>
  );
}

export function BenchmarkV2Screen({
  implementation,
}: {
  implementation: BenchmarkImplementation;
}) {
  const benchmark = useBenchmarkV2(implementation);
  const palette = benchmark.stylesheetDark
    ? stylesheetPalette.dark
    : stylesheetPalette.light;

  const resultContent = (
    <>
      <Text className="mb-3 text-center text-xl font-extrabold text-on-surface">
        {implementation === 'nitrowind' ? 'NitroWind' : 'StyleSheet'} Benchmark v2
      </Text>
      <BenchmarkStatus
        implementation={implementation}
        activeScenario={benchmark.activeScenario}
      />
      <View className="my-3 gap-2">
        {benchmark.results.mount ? (
          <ResultCard result={benchmark.results.mount} />
        ) : null}
        {benchmark.results.theme ? (
          <ResultCard result={benchmark.results.theme} />
        ) : null}
      </View>
      <View className="mb-3 flex-row gap-2">
        <RNPressable
          disabled={benchmark.isRunning}
          onPress={() => void benchmark.runScenario('mount')}
          style={styles.action}
        >
          <Text className="text-xs font-bold text-white">Run mount</Text>
        </RNPressable>
        <RNPressable
          disabled={benchmark.isRunning}
          onPress={() => void benchmark.runScenario('theme')}
          style={styles.action}
        >
          <Text className="text-xs font-bold text-white">Run theme</Text>
        </RNPressable>
      </View>
    </>
  );

  if (implementation === 'stylesheet') {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: palette.background }]}
        contentContainerStyle={styles.content}
      >
        {resultContent}
        <RNView key={benchmark.mountKey} style={styles.grid}>
          {Array.from({ length: BENCHMARK_CONFIG.ITEMS_COUNT }, (_, index) => (
            <RNView
              // The control deliberately uses only static React Native styles.
              key={index}
              style={[
                styles.card,
                styles.cardDimensions,
                { backgroundColor: palette.card },
              ]}
            >
              <RNText style={[styles.cardText, { color: palette.text }]}>
                {index}
              </RNText>
            </RNView>
          ))}
        </RNView>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerClassName="px-3 pb-8 pt-5"
    >
      {resultContent}
      <View key={benchmark.mountKey} className="flex-row flex-wrap gap-2">
        {Array.from({ length: BENCHMARK_CONFIG.ITEMS_COUNT }, (_, index) => (
          <View
            key={index}
            className="h-[100px] w-[30%] items-center justify-center rounded-2xl bg-primary"
            // Keep geometry identical to the StyleSheet control even if a
            // native theme mutation temporarily drops static layout props.
            style={styles.cardDimensions}
          >
            <Text className="text-2xl font-bold text-typography">{index}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: 32, paddingHorizontal: 12, paddingTop: 20 },
  grid: { columnGap: 8, flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  card: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
  },
  cardDimensions: {
    height: 100,
    width: '30%',
  },
  cardText: { fontSize: 24, fontWeight: '700' },
  action: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 10,
    flex: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
});
