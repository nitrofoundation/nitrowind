/**
 * Backgrounds — solid palette colors, alpha opacity and theme-aware surface
 * tokens. The opacity row shows nitrowind resolving `/<alpha>` color modifiers
 * natively.
 */
import { Text, View } from 'nitrowind';

import { Caption, Screen, Section } from '../components/ui';

function Swatch({
  cls,
  label,
  dark,
}: {
  cls: string;
  label: string;
  dark?: boolean;
}) {
  return (
    <View className="w-[30%] gap-2">
      <View className={`h-16 items-center justify-center rounded-2xl ${cls}`}>
        <Text
          className={
            dark
              ? 'text-xs font-semibold text-white'
              : 'text-xs font-semibold text-on-surface'
          }
        >
          {label}
        </Text>
      </View>
      <Caption>{label}</Caption>
    </View>
  );
}

function FilterTile({ cls, label }: { cls: string; label: string }) {
  return (
    <View className="w-[47%] gap-2">
      <View
        className={`h-20 overflow-hidden rounded-2xl border border-border bg-surface-elevated ${cls}`}
      >
        <View className="h-full flex-row">
          {Array.from({ length: 3 }, (_, index) => (
            <View
              key={index}
              className={`flex-1 ${
                index % 3 === 0
                  ? 'bg-sky-500'
                  : index % 3 === 1
                    ? 'bg-emerald-500'
                    : 'bg-amber-500'
              }`}
            />
          ))}
        </View>
      </View>
      <Caption>{label}</Caption>
    </View>
  );
}

export default function Backgrounds() {
  return (
    <Screen>

      <Section
        title="Solid colors"
        subtitle="bg-<color> from the Tailwind palette"
      >
        <View className="flex-row flex-wrap gap-3">
          <Swatch cls="bg-violet-500" label="violet" dark />
          <Swatch cls="bg-rose-500" label="rose" dark />
          <Swatch cls="bg-sky-500" label="sky" dark />
          <Swatch cls="bg-emerald-500" label="emerald" dark />
          <Swatch cls="bg-amber-500" label="amber" dark />
          <Swatch cls="bg-fuchsia-500" label="fuchsia" dark />
        </View>
      </Section>

      <Section
        title="Opacity"
        subtitle="bg-primary/<alpha> — resolved natively"
      >
        <View className="flex-row flex-wrap gap-3">
          <Swatch cls="bg-primary/10" label="10%" />
          <Swatch cls="bg-primary/30" label="30%" />
          <Swatch cls="bg-primary/60" label="60%" dark />
          <Swatch cls="bg-primary" label="100%" dark />
        </View>
      </Section>

      <Section
        title="Theme surfaces"
        subtitle="Tokens that swap on dark / light"
      >
        <View className="flex-row flex-wrap gap-3">
          <Swatch cls="bg-surface border border-border" label="surface" />
          <Swatch
            cls="bg-surface-elevated border border-border"
            label="elevated"
          />
          <Swatch cls="bg-primary" label="primary" dark />
          <Swatch cls="bg-accent" label="accent" dark />
        </View>
      </Section>

      <Section
        title="Status colors"
        subtitle="Semantic tokens defined in global.css"
      >
        <View className="flex-row flex-wrap gap-3">
          <Swatch cls="bg-success" label="success" dark />
          <Swatch cls="bg-warning" label="warning" dark />
          <Swatch cls="bg-danger" label="danger" dark />
        </View>
      </Section>


      <Section
        title="Backdrop"
        subtitle="backdrop-blur-* — the engine's own native blur of what's BEHIND the view (iOS; Android renders a graceful no-op in v1)."
      >
        {/* Photo-ish busy background: a gradient wash plus crisp shapes so
            the blur-behind is actually visible through the glass card. */}
        <View className="h-44 items-center justify-center overflow-hidden rounded-3xl bg-linear-to-br from-violet-600 via-fuchsia-500 to-amber-400">
          <View className="absolute inset-0 flex-row flex-wrap items-center justify-around p-2">
            <View className="size-8 rounded-full bg-cyan-300" />
            <View className="size-10 rounded-md bg-emerald-400" />
            <View className="size-6 rounded-full bg-white" />
            <View className="size-9 rounded-lg bg-rose-500" />
            <View className="size-7 rounded-full bg-yellow-300" />
            <View className="size-10 rounded-md bg-sky-400" />
            <View className="size-6 rounded-full bg-lime-300" />
            <View className="size-8 rounded-lg bg-indigo-400" />
          </View>
          {/* The glass card: backdrop-blur-md compiles to the
              --nitrowind-backdrop-filter marker → native BackdropView. */}
          <View className="w-3/4 items-center gap-1 rounded-2xl border border-white/30 bg-white/10 p-4 backdrop-blur-md">
            <Text className="text-sm font-bold text-white">Glass card</Text>
            <Text className="text-xs text-white/80">
              backdrop-blur-md rounded-2xl bg-white/10
            </Text>
          </View>
        </View>
      </Section>

      <Section
        title="Filters"
        subtitle="Element filters via RN's filter prop: Android color-matrix everywhere (blur needs API 31+); iOS renders opacity/brightness only — the blur family needs RN's SwiftUI flag (out of scope in v1)."
      >
        <View className="flex-row flex-wrap gap-3">
          <FilterTile cls="opacity-60" label="opacity" />
          <FilterTile cls="[filter:brightness(1.25)]" label="brightness" />
          <FilterTile cls="[filter:opacity(60%)]" label="filter opacity" />
          <FilterTile cls="[filter:blur(14px)]" label="blur" />
          <FilterTile cls="contrast-125" label="contrast" />
          <FilterTile cls="grayscale" label="grayscale" />
          <FilterTile cls="hue-rotate-90" label="hue" />
          <FilterTile cls="invert" label="invert" />
          <FilterTile cls="sepia" label="sepia" />
          <FilterTile cls="saturate-150" label="saturate" />
          <FilterTile cls="drop-shadow-lg" label="shadow" />
        </View>
      </Section>
    </Screen>
  );
}
