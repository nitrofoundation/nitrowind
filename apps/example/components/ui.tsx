/**
 * Small presentational helpers shared by every demo screen.
 *
 * They use nitrowind's `View` / `Text` / `ScrollView` so all styling flows
 * through the native engine — there is no `StyleSheet` anywhere in the example.
 */
import type { ReactNode } from 'react';
import { ColorScheme, runtime } from '@nitrofoundation/nitrowind';
import { Pressable, ScrollView, Text, View } from '@nitrofoundation/nitrowind';

/** Safe-area aware scrolling page wrapper used by every demo screen. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1 bg-surface">
      {/*
       * Safe-area utilities (`px-safe-or-5`, `pb-safe-offset-10`) resolve
       * against live window insets in the native engine, so rotation / notch
       * changes never cost a React re-render.
       */}
      <ScrollView contentContainerClassName="gap-7 px-safe-or-4 pb-safe-offset-10 pt-6">
        {children}
      </ScrollView>
    </View>
  );
}

/** A titled block grouping a set of related demos. */
export function Section({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <View className={'gap-3 self-stretch' + (className ? ` ${className}` : '')}>
      <View className="gap-1">
        <Text className="text-base font-bold text-on-surface">{title}</Text>
        {subtitle ? (
          <Text className="text-sm text-muted">{subtitle}</Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** A soft, elevated, theme-aware card. */
export function Card({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <View
      className={`rounded-2xl border border-border bg-surface-elevated p-4 ${className}`}
    >
      {children}
    </View>
  );
}

/** Centered caption shown under a swatch or tile. */
export function Caption({ children }: { children: ReactNode }) {
  return (
    <Text className="text-center text-xs font-medium text-muted">
      {children}
    </Text>
  );
}

/** Toggles the global color scheme natively (no React re-render of the tree). */
export function ThemeToggle() {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        const isDark = runtime.current.colorScheme === ColorScheme.Dark;
        runtime.setColorScheme(isDark ? 'light' : 'dark');
      }}
    >
      <View className="flex-row items-center gap-2 rounded-full bg-primary px-4 py-2">
        <Text className="text-base">Theme</Text>
        <Text className="text-sm font-semibold text-primary-foreground">
          Toggle
        </Text>
      </View>
    </Pressable>
  );
}
