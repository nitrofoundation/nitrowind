import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  getNativeDiagnostics,
  resetNativeDiagnostics,
  runtime,
  type NativeDiagnosticsSnapshot,
} from '@nitrofoundation/nitrowind';
import { BENCHMARK_CONFIG, calculateStats, type BenchmarkStats } from './index';

export type BenchmarkImplementation = 'nitrowind' | 'stylesheet';
export type BenchmarkScenario = 'mount' | 'theme';

export interface BenchmarkResult extends BenchmarkStats {
  scenario: BenchmarkScenario;
  implementation: BenchmarkImplementation;
  reactRenders: number;
  warmupRuns: number;
  valid: boolean;
  validationIssues: string[];
  nativeDiagnostics?: NativeDiagnosticsSnapshot;
}

interface BenchmarkV2State {
  isRunning: boolean;
  activeScenario: BenchmarkScenario | null;
  completedRuns: number;
  mountKey: number;
  stylesheetDark: boolean;
  results: Partial<Record<BenchmarkScenario, BenchmarkResult>>;
  renderCount: number;
  runAll: () => Promise<void>;
  runScenario: (scenario: BenchmarkScenario) => Promise<void>;
}

const wait = (milliseconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, milliseconds));

/** Used outside measurements to let the simulator paint before more work. */
const waitForVisualCommit = () =>
  new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

export function useBenchmarkV2(
  implementation: BenchmarkImplementation,
): BenchmarkV2State {
  const [isRunning, setIsRunning] = useState(false);
  const [activeScenario, setActiveScenario] =
    useState<BenchmarkScenario | null>(null);
  const [completedRuns, setCompletedRuns] = useState(0);
  const [mountKey, setMountKey] = useState(0);
  const [stylesheetDark, setStylesheetDark] = useState(false);
  const [results, setResults] = useState<
    Partial<Record<BenchmarkScenario, BenchmarkResult>>
  >({});
  const renderCountRef = useRef(0);
  const runningRef = useRef(false);
  const pendingReactCommitRef = useRef<(() => void) | null>(null);
  const stylesheetDarkRef = useRef(stylesheetDark);
  renderCountRef.current += 1;

  useLayoutEffect(() => {
    stylesheetDarkRef.current = stylesheetDark;
    const resolve = pendingReactCommitRef.current;
    pendingReactCommitRef.current = null;
    resolve?.();
  }, [mountKey, stylesheetDark]);

  const waitForNextReactCommit = useCallback(
    () =>
      new Promise<void>(resolve => {
        pendingReactCommitRef.current = resolve;
      }),
    [],
  );

  const runScenario = useCallback(
    async (scenario: BenchmarkScenario) => {
      if (runningRef.current) return;
      runningRef.current = true;
      setIsRunning(true);
      setActiveScenario(scenario);
      setCompletedRuns(0);

      // Let the benchmark status UI commit before recording the baseline.
      await waitForVisualCommit();
      const renderBaseline = renderCountRef.current;
      const samples: number[] = [];
      const validationIssues: string[] = [];
      const total = BENCHMARK_CONFIG.WARMUP_RUNS + BENCHMARK_CONFIG.RUNS;

      for (let run = 0; run < total; run += 1) {
        await wait(BENCHMARK_CONFIG.DELAY_BETWEEN_RUNS);

        // Exclude warmup work from the native counters just as we exclude it
        // from the JavaScript timing samples.
        if (
          implementation === 'nitrowind' &&
          run === BENCHMARK_CONFIG.WARMUP_RUNS
        ) {
          resetNativeDiagnostics();
        }

        const start = performance.now();

        if (scenario === 'mount') {
          const committed = waitForNextReactCommit();
          setMountKey(previous => previous + 1);
          await committed;
        } else if (implementation === 'nitrowind') {
          const expectedTheme = run % 2 === 0 ? 'ocean' : 'ember';
          runtime.setTheme(expectedTheme);
          if (runtime.getThemeName() !== expectedTheme) {
            validationIssues.push(
              `Theme did not change to ${expectedTheme} on run ${run + 1}`,
            );
          }
        } else {
          const expectedDark = !stylesheetDarkRef.current;
          const committed = waitForNextReactCommit();
          setStylesheetDark(expectedDark);
          await committed;
          if (stylesheetDarkRef.current !== expectedDark) {
            validationIssues.push(
              `StyleSheet theme did not commit on run ${run + 1}`,
            );
          }
        }

        const duration = performance.now() - start;
        if (run >= BENCHMARK_CONFIG.WARMUP_RUNS) samples.push(duration);
        await waitForVisualCommit();
      }

      // Snapshot diagnostics before restoring the demo theme so native totals
      // describe exactly the measured runs (not an extra cleanup mutation).
      const nativeDiagnostics =
        implementation === 'nitrowind' ? getNativeDiagnostics() : undefined;

      if (implementation === 'nitrowind' && scenario === 'theme') {
        runtime.setTheme('light');
        await waitForVisualCommit();
      }

      const stats = calculateStats(samples);
      const reactRenders = renderCountRef.current - renderBaseline;
      if (scenario === 'theme' && implementation === 'nitrowind') {
        if (!nativeDiagnostics?.nativeAvailable) {
          validationIssues.push('Native diagnostics are unavailable');
        } else {
          if (nativeDiagnostics.linkedNodes === 0)
            validationIssues.push('No nodes are linked to the native registry');
          if (nativeDiagnostics.affectedNodes === 0)
            validationIssues.push('Theme changes affected zero native nodes');
          if (nativeDiagnostics.resolvedNodes === 0)
            validationIssues.push('Theme changes resolved zero native nodes');
          if (
            nativeDiagnostics.committedMutations === 0 &&
            nativeDiagnostics.skippedMutations === 0
          )
            validationIssues.push('Native resolver produced no mutations');
        }
        if (reactRenders !== 0) {
          validationIssues.push(
            `Nitrowind theme switching caused ${reactRenders} React renders`,
          );
        }
      }

      if (
        scenario === 'theme' &&
        implementation === 'stylesheet' &&
        reactRenders === 0
      ) {
        validationIssues.push('StyleSheet control did not render a theme change');
      }

      const result: BenchmarkResult = {
        ...stats,
        scenario,
        implementation,
        reactRenders,
        warmupRuns: BENCHMARK_CONFIG.WARMUP_RUNS,
        valid: validationIssues.length === 0,
        validationIssues: [...new Set(validationIssues)],
        nativeDiagnostics,
      };
      console.info('[BenchmarkV2]', JSON.stringify(result));
      setResults(previous => ({ ...previous, [scenario]: result }));
      setCompletedRuns(BENCHMARK_CONFIG.RUNS);
      setActiveScenario(null);
      setIsRunning(false);
      runningRef.current = false;
    },
    [implementation, waitForNextReactCommit],
  );

  const runAll = useCallback(async () => {
    if (runningRef.current) return;
    await runScenario('mount');
    // runScenario clears the guard when it finishes.
    await runScenario('theme');
  }, [runScenario]);

  // Keep the old benchmark's useful behavior: results appear without requiring
  // the user to discover a hidden start button.
  const didAutoStart = useRef(false);
  useEffect(() => {
    if (didAutoStart.current) return;
    didAutoStart.current = true;
    void runAll();
  }, [runAll]);

  return {
    isRunning,
    activeScenario,
    completedRuns,
    mountKey,
    stylesheetDark,
    results,
    renderCount: renderCountRef.current,
    runAll,
    runScenario,
  };
}
