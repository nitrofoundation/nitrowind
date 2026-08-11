import './global.css';

import {useEffect, useRef, useState} from 'react';
import {
  ColorScheme,
  getNativeDiagnostics,
  NitrowindProvider,
  resetNativeDiagnostics,
  useNitrowind,
} from '@nitrofoundation/nitrowind';
import {Text, View} from '@nitrofoundation/nitrowind/components';

function MacOSSmokeScreen() {
  const nitrowind = useNitrowind();
  const [linked, setLinked] = useState(true);
  const [smokeResult, setSmokeResult] = useState<string | null>(null);
  const smokeStarted = useRef(false);
  const nitrowindRef = useRef(nitrowind);
  nitrowindRef.current = nitrowind;

  useEffect(() => {
    if (__DEV__ || smokeStarted.current) return;
    smokeStarted.current = true;

    const initialScheme = nitrowind.snapshot.colorScheme;
    const initialSchemeName =
      initialScheme === ColorScheme.Dark ? 'dark' : 'light';
    const opposite =
      initialScheme === ColorScheme.Dark ? 'light' : 'dark';
    resetNativeDiagnostics();

    const timers = [
      setTimeout(() => nitrowindRef.current.setColorScheme(opposite), 250),
      setTimeout(() => setLinked(false), 500),
      setTimeout(() => setLinked(true), 750),
      setTimeout(
        () => nitrowindRef.current.setColorScheme(initialSchemeName),
        1000,
      ),
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

  return (
    <View className="flex-1 items-center justify-center bg-surface p-12">
      {linked ? (
        <View className="w-full max-w-xl rounded-3xl border border-border bg-card p-10 shadow-xl">
          <Text className="text-sm font-semibold uppercase tracking-widest text-accent">
            React Native macOS · Phase 0
          </Text>
          <Text className="mt-3 text-4xl font-black text-foreground">
            NitroCSS is linked
          </Text>
          <Text className="mt-4 text-lg text-muted">
            This card is resolved by Nitrowind and committed through the native
            Fabric engine. Toggle the theme, then unlink and relink it to test
            registry cleanup and tag reuse.
          </Text>
          {smokeResult ? (
            <Text className="mt-4 text-sm font-semibold text-accent">
              {smokeResult}
            </Text>
          ) : null}
          <View className="mt-8 flex-row gap-4">
            <Text
              accessibilityRole="button"
              className="rounded-xl bg-accent px-5 py-3 font-bold text-white"
              onPress={toggleTheme}>
              Toggle theme
            </Text>
            <Text
              accessibilityRole="button"
              className="rounded-xl border border-border px-5 py-3 font-bold text-foreground"
              onPress={() => setLinked(false)}>
              Unlink card
            </Text>
          </View>
        </View>
      ) : (
        <Text
          accessibilityRole="button"
          className="rounded-xl bg-accent px-5 py-3 font-bold text-white"
          onPress={() => setLinked(true)}>
          Relink native view
        </Text>
      )}
    </View>
  );
}

export default function App() {
  return (
    <NitrowindProvider>
      <MacOSSmokeScreen />
    </NitrowindProvider>
  );
}
