import { useCallback, useLayoutEffect, useState } from 'react';
import { BENCHMARK_CONFIG, calculateStats, type BenchmarkStats } from './index';

export interface UseBenchmarkReturn {
  measurements: number[];
  currentRun: number;
  isComplete: boolean;
  renderKey: number;
  stats: BenchmarkStats;
  average: number;
  min: number;
  max: number;
  totalRuns: number;
  itemsCount: number;
}

export function useBenchmark(): UseBenchmarkReturn {
  const [measurements, setMeasurements] = useState<number[]>([]);
  const [currentRun, setCurrentRun] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [renderKey, setRenderKey] = useState(0);

  const runBenchmark = useCallback(() => {
    const startTime = performance.now();
    setRenderKey((previous: number) => previous + 1);

    // This is deliberately the same completion signal used by the Uniwind
    // benchmark: it captures the time from a keyed remount until React Native
    // has returned to idle after layout.
    requestIdleCallback(() => {
      const endTime = performance.now();
      const duration = endTime - startTime;

      setMeasurements((previous: number[]) => [...previous, duration]);
      setCurrentRun((previous: number) => previous + 1);
    });
  }, []);

  useLayoutEffect(() => {
    if (currentRun < BENCHMARK_CONFIG.RUNS) {
      const timer = setTimeout(runBenchmark, BENCHMARK_CONFIG.DELAY_BETWEEN_RUNS);
      return () => clearTimeout(timer);
    }
    if (currentRun === BENCHMARK_CONFIG.RUNS && !isComplete) {
      setIsComplete(true);
    }
  }, [currentRun, runBenchmark]);

  const stats = calculateStats(measurements);

  return {
    measurements,
    currentRun,
    isComplete,
    renderKey,
    stats,
    average: stats.average,
    min: stats.min,
    max: stats.max,
    totalRuns: BENCHMARK_CONFIG.RUNS,
    itemsCount: BENCHMARK_CONFIG.ITEMS_COUNT,
  };
}
