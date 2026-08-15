/**
 * Theming — toggle the global color scheme and watch every token-based style
 * update. The engine swaps the underlying CSS variables natively, so the whole
 * tree restyles without a React re-render. `dark:` variants are also resolved
 * natively.
 */
import { Pressable, Text, View } from '@nitrofoundation/nitrowind';

import { Caption, Card, Screen, Section } from '../components/ui';
import { setExampleColorScheme, setExampleTheme } from '../platform/theme';

function Token({ cls, label }: { cls: string; label: string }) {
  return (
    <View className="w-[30%] gap-2">
      <View className={`h-14 rounded-xl border border-border ${cls}`} />
      <Caption>{label}</Caption>
    </View>
  );
}

const COLOR_SCHEMES = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Auto', value: 'system' },
] as const;

const THEMES = [
  { label: 'Base', value: 'light', swatch: 'bg-primary' },
  { label: 'Ocean', value: 'ocean', swatch: 'bg-primary' },
  { label: 'Ember', value: 'ember', swatch: 'bg-warning' },
  { label: 'Graphite', value: 'graphite', swatch: 'bg-accent' },
] as const;

export default function Theming() {
  return (
    <Screen>
      <Section
        title="Adaptive scheme"
        subtitle="Light, dark, and system update the same runtime tokens on every platform."
      >
        <View className="flex-row flex-wrap gap-2">
          {COLOR_SCHEMES.map(scheme => (
            <Pressable
              key={scheme.value}
              accessibilityRole="button"
              onPress={() => setExampleColorScheme(scheme.value)}
              className="rounded-full border border-border bg-surface-elevated px-4 py-2"
            >
              <Text className="text-sm font-semibold text-on-surface">
                {scheme.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section
        title="Adaptive themes"
        subtitle="Named palettes update semantic tokens without changing component code."
      >
        <View className="flex-row flex-wrap gap-2">
          {THEMES.map(theme => (
            <Pressable
              key={theme.value}
              accessibilityRole="button"
              onPress={() => setExampleTheme(theme.value)}
              className="flex-row items-center gap-2 rounded-full border border-border bg-surface-elevated px-4 py-2"
            >
              <View className={`h-3 w-3 rounded-full ${theme.swatch}`} />
              <Text className="text-sm font-semibold text-on-surface">
                {theme.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Card className="gap-3">
          <View className="flex-row gap-3">
            <View className="h-16 flex-1 rounded-xl bg-primary" />
            <View className="h-16 flex-1 rounded-xl bg-accent" />
            <View className="h-16 flex-1 rounded-xl bg-warning" />
          </View>
          <Text className="text-sm font-semibold text-on-surface">
            These swatches and this card restyle from the shared theme runtime.
          </Text>
        </Card>
      </Section>

      <Section
        title="Theme tokens"
        subtitle="Each swatch is a CSS variable from global.css"
      >
        <View className="flex-row flex-wrap gap-3">
          <Token cls="bg-primary" label="primary" />
          <Token cls="bg-accent" label="accent" />
          <Token cls="bg-surface" label="surface" />
          <Token cls="bg-surface-elevated" label="elevated" />
          <Token cls="bg-on-surface" label="on-surface" />
          <Token cls="bg-muted" label="muted" />
        </View>
      </Section>

      <Section
        title="dark: variant"
        subtitle="Pick a different value per scheme"
      >
        <Card className="bg-white dark:bg-slate-800">
          <Text className="text-base font-semibold text-slate-900 dark:text-slate-100">
            bg-white dark:bg-slate-800
          </Text>
          <Text className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            This card hard-codes its colors per scheme with `dark:` instead of
            using semantic tokens.
          </Text>
        </Card>
      </Section>
    </Screen>
  );
}
