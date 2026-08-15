export const BENCHMARK_CONFIG = {
  RUNS: 10,
  // Matches https://github.com/uniwind/uniwind-benchmarks exactly: the screen
  // mounts 1,000 cards (2,003 native views including the screen chrome).
  ITEMS_COUNT: 1000,
  DELAY_BETWEEN_RUNS: 100,
} as const;

export function calculateAverage(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateMin(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.min(...values);
}

export function calculateMax(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return Math.max(...values);
}

export function calculateStdDev(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const average = calculateAverage(values);
  const squareDiffs = values.map(value => (value - average) ** 2);

  return Math.sqrt(calculateAverage(squareDiffs));
}

export function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

export interface BenchmarkStats {
  average: number;
  min: number;
  max: number;
  median: number;
  stdDev: number;
  count: number;
}

export function calculateStats(measurements: number[]): BenchmarkStats {
  return {
    average: calculateAverage(measurements),
    min: calculateMin(measurements),
    max: calculateMax(measurements),
    median: calculateMedian(measurements),
    stdDev: calculateStdDev(measurements),
    count: measurements.length,
  };
}

export function formatMs(milliseconds: number, decimals = 2): string {
  return `${milliseconds.toFixed(decimals)}ms`;
}

export { useBenchmark, type UseBenchmarkReturn } from './useBenchmark';
