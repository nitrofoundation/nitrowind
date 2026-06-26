import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { useEffect, useRef, useState } from 'react';
import { getFrameMetrics } from 'nitrolist';
import type { ViewabilityState } from 'nitrolist';

const FRAME_SAMPLE_MS = 1000;
const TARGET_FRAME_MS = 16.67;

type FrameTimelineSample = {
  timeMs: number;
  jsFps: number;
  jsDrops: number;
  uiFps: number | null;
  uiDrops: number | null;
  memoryMb: number | null;
};

type ResoniteBitopushItem = {
  id: string;
  template: string;
  props: {
    text: string;
    height?: number;
  };
};

type NitroListInspectorEventMap = {
  setMonitoring: {
    enabled: boolean;
  };
  setSnapshot: {
    mode: 'nitro';
    monitoringEnabled: boolean;
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
    frameTimeline: FrameTimelineSample[];
    renderedItems: Array<{
      id: string;
      template: string;
      text: string;
      height: number | null;
    }>;
  };
};

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function readUsedMemoryMb(): number | null {
  const perf = globalThis.performance as Performance & {
    memory?: { usedJSHeapSize?: number };
  };
  const used = perf.memory?.usedJSHeapSize;
  if (typeof used === 'number') {
    return used / 1024 / 1024;
  }

  const hermes = globalThis as typeof globalThis & {
    HermesInternal?: {
      getRuntimeProperties?: () => Record<string, unknown>;
    };
  };
  const runtimeProperties = hermes.HermesInternal?.getRuntimeProperties?.();
  if (runtimeProperties == null) {
    return null;
  }

  for (const [key, value] of Object.entries(runtimeProperties)) {
    if (!/(heap|memory|rss|used)/i.test(key)) {
      continue;
    }

    const parsed =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value.replace(/[^0-9.]/g, ''))
          : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      continue;
    }

    return parsed > 1024 * 1024 ? parsed / 1024 / 1024 : parsed;
  }

  return null;
}

export function useResoniteBitopushTools({
  itemsById,
  viewability,
}: {
  itemsById: ReadonlyMap<string, ResoniteBitopushItem>;
  viewability: ViewabilityState;
}) {
  const lastSnapshotKey = useRef('');
  const startedAt = useRef(nowMs());
  const firstRowsMs = useRef<number | null>(null);
  const settledMs = useRef<number | null>(null);
  const frameStats = useRef({ jsFrames: 0, jsDrops: 0 });
  const nativeFrameStats = useRef<{
    frames: number;
    frameDrops: number;
    fps: number;
  } | null>(null);
  const memoryStats = useRef({ min: Number.POSITIVE_INFINITY, max: 0 });
  const timeline = useRef<FrameTimelineSample[]>([]);
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [metricsRevision, setMetricsRevision] = useState(0);
  const rozeniteClient = useRozeniteDevToolsClient<NitroListInspectorEventMap>({
    pluginId: '@nitrowind/nitrolist-rozenite-plugin',
  });

  useEffect(() => {
    if (rozeniteClient == null) {
      return;
    }

    const subscription = rozeniteClient.onMessage(
      'setMonitoring',
      ({ enabled }) => {
        setMonitoringEnabled(enabled);
      },
    );

    return () => {
      subscription.remove();
    };
  }, [rozeniteClient]);

  useEffect(() => {
    if (!monitoringEnabled) {
      return;
    }

    let rafId = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let lastFrame = 0;
    const monitoringStartedAt = nowMs();
    let sampleStartedAt = monitoringStartedAt;
    let sampleFrames = 0;
    let sampleDrops = 0;
    let disposed = false;

    startedAt.current = monitoringStartedAt;
    frameStats.current = { jsFrames: 0, jsDrops: 0 };
    nativeFrameStats.current = null;
    memoryStats.current = { min: Number.POSITIVE_INFINITY, max: 0 };
    timeline.current = [];
    setMetricsRevision(revision => revision + 1);

    const captureMemory = () => {
      const memoryMb = readUsedMemoryMb();
      if (memoryMb == null) {
        return null;
      }
      memoryStats.current.min = Math.min(memoryStats.current.min, memoryMb);
      memoryStats.current.max = Math.max(memoryStats.current.max, memoryMb);
      return memoryMb;
    };

    const flushSample = async () => {
      const currentTime = nowMs();
      const elapsed = Math.max(1, currentTime - sampleStartedAt);
      const memoryMb = captureMemory();
      const nativeMetrics = await getFrameMetrics().catch(() => null);
      const previousNativeMetrics = nativeFrameStats.current;
      const uiFrames = nativeMetrics?.frames ?? null;
      const uiDrops = nativeMetrics?.frameDrops ?? null;
      const uiFps =
        nativeMetrics != null && previousNativeMetrics != null
          ? Math.round(
              ((nativeMetrics.frames - previousNativeMetrics.frames) /
                elapsed) *
                1000,
            )
          : nativeMetrics?.fps != null
            ? Math.round(nativeMetrics.fps)
            : null;
      const sampleUiDrops =
        nativeMetrics != null && previousNativeMetrics != null
          ? Math.max(
              0,
              nativeMetrics.frameDrops - previousNativeMetrics.frameDrops,
            )
          : null;
      nativeFrameStats.current = nativeMetrics;
      timeline.current = [
        ...timeline.current,
        {
          timeMs: currentTime - startedAt.current,
          jsFps: Math.round((sampleFrames / elapsed) * 1000),
          jsDrops: sampleDrops,
          uiFps,
          uiDrops: sampleUiDrops,
          memoryMb,
        },
      ].slice(-40);
      sampleStartedAt = currentTime;
      sampleFrames = 0;
      sampleDrops = 0;
      setMetricsRevision(revision => revision + 1);
    };

    const tick = (timestamp: number) => {
      if (disposed) {
        return;
      }
      if (lastFrame > 0) {
        const delta = timestamp - lastFrame;
        const drops = Math.max(0, Math.round(delta / TARGET_FRAME_MS) - 1);
        frameStats.current.jsFrames += 1;
        frameStats.current.jsDrops += drops;
        sampleFrames += 1;
        sampleDrops += drops;
      }
      lastFrame = timestamp;
      captureMemory();
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    intervalId = setInterval(() => {
      void flushSample();
    }, FRAME_SAMPLE_MS);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      if (intervalId != null) {
        clearInterval(intervalId);
      }
    };
  }, [monitoringEnabled]);

  useEffect(() => {
    if (viewability.visibleIds.length > 0 && firstRowsMs.current == null) {
      const currentTime = nowMs();
      firstRowsMs.current = currentTime - startedAt.current;
    }

    if (firstRowsMs.current != null && settledMs.current == null) {
      settledMs.current = nowMs() - startedAt.current;
    }

    const key = [
      viewability.visibleIds.join(','),
      viewability.renderedIds.join(','),
      viewability.outsideViewportIds.join(','),
      firstRowsMs.current?.toFixed(1) ?? '',
      settledMs.current?.toFixed(1) ?? '',
      monitoringEnabled ? 'monitoring' : 'idle',
      metricsRevision,
    ].join('|');

    if (rozeniteClient == null || key === lastSnapshotKey.current) {
      return;
    }

    lastSnapshotKey.current = key;
    rozeniteClient.send('setSnapshot', {
      mode: 'nitro',
      monitoringEnabled,
      visibleIds: viewability.visibleIds,
      renderedIds: viewability.renderedIds,
      prerenderedIds: viewability.outsideViewportIds,
      visibleCount: viewability.visibleIds.length,
      renderedCount: viewability.renderedIds.length,
      prerenderedCount: viewability.outsideViewportIds.length,
      jsCommitMs: null,
      firstLayoutMs: firstRowsMs.current,
      interactionsSettledMs: settledMs.current,
      jsFrames: frameStats.current.jsFrames,
      jsFrameDrops: frameStats.current.jsDrops,
      uiFrames: nativeFrameStats.current?.frames ?? null,
      uiFrameDrops: nativeFrameStats.current?.frameDrops ?? null,
      minMemoryMb: Number.isFinite(memoryStats.current.min)
        ? memoryStats.current.min
        : null,
      maxMemoryMb: memoryStats.current.max > 0 ? memoryStats.current.max : null,
      frameTimeline: timeline.current,
      renderedItems: viewability.renderedIds
        .map(id => itemsById.get(id))
        .filter((item): item is ResoniteBitopushItem => item != null)
        .map(item => ({
          id: item.id,
          template: item.template,
          text: item.props.text,
          height: item.props.height ?? null,
        })),
    });
  }, [
    itemsById,
    metricsRevision,
    monitoringEnabled,
    rozeniteClient,
    viewability,
  ]);
}
