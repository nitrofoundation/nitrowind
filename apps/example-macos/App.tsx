import './global.css';

import {useEffect, useRef, useState} from 'react';
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
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    id: 'overview',
    eyebrow: 'Start here',
    title: 'macOS overview',
    description: 'Package compatibility and the native Fabric path.',
  },
  {
    id: 'runtime',
    eyebrow: 'Phase 2',
    title: 'Runtime & themes',
    description: 'AppKit colors, Display-P3, window state, and theme updates.',
  },
  {
    id: 'paint',
    eyebrow: 'Phase 3',
    title: 'Native paint',
    description: 'CALayer gradients, gradient borders, and clip paths.',
  },
  {
    id: 'recycling',
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
  const [selected, setSelected] = useState<ExampleId>('overview');
  const [linked, setLinked] = useState(true);
  const [smokeResult, setSmokeResult] = useState<string | null>(null);
  const smokeStarted = useRef(false);
  const nitrowindRef = useRef(nitrowind);
  nitrowindRef.current = nitrowind;

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
    <View className="flex-1 flex-row bg-surface">
      <View className="w-72 border-r border-border bg-card p-5">
        <View className="border-b border-border px-2 pb-5">
          <Text className="text-xs font-semibold uppercase tracking-widest text-accent">
            Nitrowind laboratory
          </Text>
          <Text className="mt-2 text-2xl font-black text-foreground">
            macOS examples
          </Text>
          <Text className="mt-2 text-sm text-muted">
            Select an example to open it in the main canvas.
          </Text>
        </View>

        <View className="mt-4 gap-2">
          {EXAMPLES.map(example => {
            const active = example.id === selected;
            return (
              <Pressable
                key={example.id}
                accessibilityRole="button"
                accessibilityLabel={example.title}
                accessibilityState={{selected: active}}
                className={
                  active
                    ? 'rounded-xl border border-border bg-surface p-4'
                    : 'rounded-xl border border-transparent p-4'
                }
                onPress={() => setSelected(example.id)}>
                <View className="flex-row items-start gap-3">
                  <View
                    className={
                      active
                        ? 'mt-1 h-2 w-2 rounded-full bg-accent'
                        : 'mt-1 h-2 w-2 rounded-full bg-border'
                    }
                  />
                  <View className="flex-1">
                    <Text className="text-xs font-semibold uppercase tracking-widest text-accent">
                      {example.eyebrow}
                    </Text>
                    <Text className="mt-1 text-base font-bold text-foreground">
                      {example.title}
                    </Text>
                    <Text className="mt-1 text-xs text-muted">
                      {example.description}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View className="mt-auto rounded-xl border border-border bg-surface p-4">
          <Text className="text-xs font-semibold text-muted">Native engine</Text>
          <Text className="mt-1 text-sm font-bold text-foreground">
            {smokeResult ?? 'Running Release smoke…'}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1">
        <View className="min-h-full items-center justify-center p-12">
          <View className="w-full max-w-3xl rounded-3xl border border-border bg-card p-10 shadow-xl">
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
        </View>
      </ScrollView>
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
