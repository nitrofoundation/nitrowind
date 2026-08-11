import './global.css';

import {useEffect, useRef, useState} from 'react';
import {useWindowDimensions} from 'react-native';
import {
  ColorScheme,
  getNativeDiagnostics,
  NitrowindProvider,
  resetNativeDiagnostics,
  useNitrowind,
} from '@nitrofoundation/nitrowind';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from '@nitrofoundation/nitrowind/components';

type ExampleId = 'overview' | 'runtime' | 'paint' | 'recycling';

const EXAMPLES: ReadonlyArray<{
  id: ExampleId;
  group: 'Library' | 'Diagnostics';
  symbol: string;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    id: 'overview',
    group: 'Library',
    symbol: '⌂',
    eyebrow: 'Start here',
    title: 'macOS overview',
    description: 'Package compatibility and the native Fabric path.',
  },
  {
    id: 'runtime',
    group: 'Library',
    symbol: '◐',
    eyebrow: 'Phase 2',
    title: 'Runtime & themes',
    description: 'AppKit colors, Display-P3, window state, and theme updates.',
  },
  {
    id: 'paint',
    group: 'Library',
    symbol: '✦',
    eyebrow: 'Phase 3',
    title: 'Native paint',
    description: 'CALayer gradients, gradient borders, and clip paths.',
  },
  {
    id: 'recycling',
    group: 'Diagnostics',
    symbol: '↻',
    eyebrow: 'Reliability',
    title: 'Tag reuse',
    description: 'Unlink and relink a Fabric view to verify registry cleanup.',
  },
];

function ExampleHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <View className="gap-3">
      <Text className="text-sm font-semibold uppercase tracking-widest text-accent">
        {eyebrow}
      </Text>
      <Text className="text-4xl font-black text-foreground">{title}</Text>
      <Text className="max-w-2xl text-lg text-muted">{description}</Text>
    </View>
  );
}

function MacOSExampleBrowser() {
  const nitrowind = useNitrowind();
  const {width} = useWindowDimensions();
  const compact = width < 900;
  const [selected, setSelected] = useState<ExampleId>('overview');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [linked, setLinked] = useState(true);
  const [smokeResult, setSmokeResult] = useState<string | null>(null);
  const smokeStarted = useRef(false);
  const nitrowindRef = useRef(nitrowind);
  const compactRef = useRef(compact);
  nitrowindRef.current = nitrowind;

  useEffect(() => {
    if (compactRef.current === compact) return;
    compactRef.current = compact;
    setSidebarVisible(!compact);
  }, [compact]);

  useEffect(() => {
    if (__DEV__ || smokeStarted.current) return;
    smokeStarted.current = true;

    const initialScheme = nitrowind.snapshot.colorScheme;
    const opposite = initialScheme === ColorScheme.Dark ? 'light' : 'dark';
    resetNativeDiagnostics();

    const timers = [
      setTimeout(() => nitrowindRef.current.setColorScheme(opposite), 250),
      setTimeout(() => setLinked(false), 500),
      setTimeout(() => setLinked(true), 750),
      setTimeout(() => nitrowindRef.current.setColorScheme('system'), 1000),
      setTimeout(() => {
        const diagnostics = getNativeDiagnostics();
        setSmokeResult(
          diagnostics.nativeAvailable
            ? `Automatic native smoke passed · ${diagnostics.linkedNodes} linked · ${diagnostics.committedMutations} commits`
            : 'Automatic smoke used the JavaScript fallback',
        );
      }, 1250),
    ];

    return () => timers.forEach(clearTimeout);
  }, []);

  const toggleTheme = () => {
    const next =
      nitrowind.snapshot.colorScheme === ColorScheme.Dark ? 'light' : 'dark';
    nitrowind.setColorScheme(next);
  };

  const activeExample = EXAMPLES.find(example => example.id === selected)!;

  return (
    <View className="mac-window flex-1 flex-row">
      {sidebarVisible ? (
        <View className="mac-sidebar w-64 border-r border-border px-3 py-4">
          <View className="px-2 pb-5 pt-1">
            <Text className="text-xl font-bold text-foreground">Nitrowind</Text>
            <Text className="mt-1 text-xs text-muted">macOS examples</Text>
          </View>

          {(['Library', 'Diagnostics'] as const).map(group => (
            <View className="mb-5" key={group}>
              <Text className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {group}
              </Text>
              <View className="gap-1">
                {EXAMPLES.filter(example => example.group === group).map(
                  example => {
                    const active = example.id === selected;
                    return (
                      <Pressable
                        key={example.id}
                        accessibilityRole="button"
                        accessibilityLabel={example.title}
                        accessibilityState={{selected: active}}
                        focusable
                        className={
                          active
                            ? 'mac-sidebar-selection rounded-lg px-3 py-2'
                            : 'rounded-lg px-3 py-2 hover:bg-surface focus:bg-surface'
                        }
                        onPress={() => setSelected(example.id)}>
                        <View className="flex-row items-center gap-3">
                          <Text
                            className={
                              active
                                ? 'mac-sidebar-selection-text w-5 text-center text-base font-semibold'
                                : 'w-5 text-center text-base font-semibold text-accent'
                            }>
                            {example.symbol}
                          </Text>
                          <Text
                            className={
                              active
                                ? 'mac-sidebar-selection-text flex-1 text-sm font-semibold'
                                : 'flex-1 text-sm font-medium text-foreground'
                            }>
                            {example.title}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <View className="mac-content flex-1">
        <View className="mac-toolbar h-12 flex-row items-center gap-3 border-b border-border px-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
            className="h-8 w-8 items-center justify-center rounded-md hover:bg-surface focus:bg-surface"
            focusable
            onPress={() => setSidebarVisible(value => !value)}>
            <Text className="text-lg font-semibold text-foreground">☷</Text>
          </Pressable>
          <View className="h-5 w-px bg-border" />
          <Text className="text-sm font-semibold text-foreground">
            {activeExample.title}
          </Text>
          <View className="ml-auto flex-row items-center gap-2">
            <View className="h-2 w-2 rounded-full bg-emerald-500" />
            <Text className="text-xs text-muted">
              {smokeResult ? 'Native engine ready' : 'Checking native engine…'}
            </Text>
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{paddingHorizontal: 40, paddingVertical: 36}}>
          <View className="w-full max-w-4xl self-center">
            <ExampleHeader
              eyebrow={activeExample.eyebrow}
              title={activeExample.title}
              description={activeExample.description}
            />

            {selected === 'overview' ? (
              <View className="mt-8 gap-3">
                <View className="rounded-2xl border border-border bg-surface p-5">
                  <Text className="text-lg font-bold text-foreground">
                    NitroCSS is linked
                  </Text>
                  <Text className="mt-2 text-sm text-muted">
                    Tailwind classes compile once, then the native Fabric engine
                    resolves runtime changes without rerendering React.
                  </Text>
                </View>
                <View className="flex-row gap-3">
                  <View className="flex-1 rounded-2xl border border-border p-5">
                    <Text className="font-bold text-foreground">macOS 14+</Text>
                    <Text className="mt-1 text-sm text-muted">New Architecture</Text>
                  </View>
                  <View className="flex-1 rounded-2xl border border-border p-5">
                    <Text className="font-bold text-foreground">Shared C++</Text>
                    <Text className="mt-1 text-sm text-muted">Native resolver</Text>
                  </View>
                  <View className="flex-1 rounded-2xl border border-border p-5">
                    <Text className="font-bold text-foreground">AppKit</Text>
                    <Text className="mt-1 text-sm text-muted">Platform adapters</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {selected === 'runtime' ? (
              <View className="mt-8 gap-4">
                <View className="native-semantic-panel flex-row items-center gap-3 rounded-xl border p-4">
                  <View className="native-p3-swatch h-6 w-6 rounded-full" />
                  <Text className="native-semantic-label text-sm font-semibold">
                    AppKit semantic, high-contrast, and Display-P3 colors
                  </Text>
                </View>
                <Text className="text-sm text-muted">
                  Active window {Math.round(nitrowind.snapshot.screen.width)} ×{' '}
                  {Math.round(nitrowind.snapshot.screen.height)} ·{' '}
                  {nitrowind.snapshot.pixelRatio.toFixed(1)}× backing scale
                </Text>
                <View className="flex-row gap-3">
                  <Pressable
                    accessibilityRole="button"
                    className="rounded-xl bg-accent px-5 py-3"
                    onPress={toggleTheme}>
                    <Text className="font-bold text-white">Toggle theme</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    className="rounded-xl border border-border px-5 py-3"
                    onPress={() => nitrowind.setColorScheme('system')}>
                    <Text className="font-bold text-foreground">Follow system</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {selected === 'paint' ? (
              <View className="mt-8 gap-4">
                <View className="flex-row gap-4">
                  <View className="h-32 flex-1 items-center justify-center rounded-2xl bg-linear-45 from-violet-600 via-blue-600 to-cyan-500">
                    <Text className="font-bold text-white">AppKit gradient</Text>
                  </View>
                  <View className="phase3-clip h-32 flex-1 items-center justify-center bg-linear-45 from-orange-500 to-pink-500">
                    <Text className="font-bold text-white">Native clip path</Text>
                  </View>
                </View>
                <View className="phase3-gradient-border items-center rounded-xl p-5">
                  <Text className="native-semantic-label text-sm font-semibold">
                    Shared Apple gradient-border adapter
                  </Text>
                </View>
              </View>
            ) : null}

            {selected === 'recycling' ? (
              <View className="mt-8 gap-4">
                {linked ? (
                  <View className="rounded-2xl border border-border bg-surface p-6">
                    <Text className="text-lg font-bold text-foreground">
                      Linked Fabric view
                    </Text>
                    <Text className="mt-2 text-sm text-muted">
                      Remove and restore this node to verify native registry
                      cleanup, recycled tags, and fresh style application.
                    </Text>
                  </View>
                ) : (
                  <View className="rounded-2xl border border-dashed border-border p-6">
                    <Text className="text-sm text-muted">
                      Native view unlinked. Its registry entry should be gone.
                    </Text>
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  className="self-start rounded-xl bg-accent px-5 py-3"
                  onPress={() => setLinked(value => !value)}>
                  <Text className="font-bold text-white">
                    {linked ? 'Unlink native view' : 'Relink native view'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <NitrowindProvider>
      <MacOSExampleBrowser />
    </NitrowindProvider>
  );
}
