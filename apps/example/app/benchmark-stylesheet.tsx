import { StyleSheet, ScrollView, Text, View } from 'react-native';
import { useBenchmark } from '../benchmark';

/**
 * Control for the Nitrowind benchmark. It deliberately has the same structure
 * and timing hook as benchmark.tsx, but renders only React Native primitives
 * with StyleSheet-created styles. This makes the difference between the two
 * screens attributable to Nitrowind's wrapper/resolution path rather than the
 * simulator, React Native version, or benchmark harness.
 */
export default function StyleSheetBenchmarkScreen() {
  const {
    isComplete,
    currentRun,
    totalRuns,
    average,
    min,
    max,
    itemsCount,
    renderKey,
  } = useBenchmark();

  return (
    <View style={styles.container}>
      <Text style={styles.header}>StyleSheet Benchmark</Text>

      {!isComplete ? (
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>Running benchmark...</Text>
          <Text style={styles.statsText}>
            Run {currentRun + 1} of {totalRuns}
          </Text>
        </View>
      ) : (
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>Benchmark complete</Text>
          <Text style={styles.statsText}>Average: {average.toFixed(2)}ms</Text>
          <Text style={styles.statsText}>Min: {min.toFixed(2)}ms</Text>
          <Text style={styles.statsText}>Max: {max.toFixed(2)}ms</Text>
          <Text style={styles.statsSubtext}>
            {itemsCount * 2 + 3} views x {totalRuns} runs
          </Text>
        </View>
      )}

      <ScrollView
        key={renderKey}
        contentContainerStyle={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        {Array.from({ length: itemsCount }, (_, index) => (
          <View key={index} style={styles.item}>
            <Text style={styles.itemText}>{index}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 100,
    paddingHorizontal: 12,
  },
  header: {
    color: '#f9fafb',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  statsContainer: {
    backgroundColor: '#353b48',
    borderRadius: 8,
    marginBottom: 16,
    padding: 16,
  },
  statsText: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  statsSubtext: {
    color: '#f9fafb',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  scrollView: {
    columnGap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  item: {
    alignItems: 'center',
    backgroundColor: '#a78bfa',
    borderRadius: 16,
    height: 100,
    justifyContent: 'center',
    width: '30%',
  },
  itemText: {
    color: '#f9fafb',
    fontSize: 24,
    fontWeight: '700',
  },
});
