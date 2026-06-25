/**
 * Backgrounds — solid palette colors, alpha opacity and theme-aware surface
 * tokens. The opacity row shows nitrowind resolving `/<alpha>` color modifiers
 * natively.
 */
import { Text, View } from "nitrowind";

import { Caption, Screen, Section } from "../components/ui";

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
              ? "text-xs font-semibold text-white"
              : "text-xs font-semibold text-on-surface"
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
          <View className="flex-1 bg-sky-500" />
          <View className="flex-1 bg-emerald-500" />
          <View className="flex-1 bg-amber-500" />
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
        title="Filters"
        subtitle="Native filters use React Native's Android-only filter prop; opacity is the cross-platform fallback."
      >
        <View className="flex-row flex-wrap gap-3">
          <FilterTile cls="opacity-60" label="opacity" />
          <FilterTile
            cls="android:[filter:brightness(1.25)]"
            label="android brightness"
          />
          <FilterTile
            cls="android:[filter:opacity(60%)]"
            label="android filter opacity"
          />
          <FilterTile cls="android:blur-sm" label="android blur" />
          <FilterTile cls="android:contrast-125" label="android contrast" />
          <FilterTile cls="android:grayscale" label="android grayscale" />
          <FilterTile cls="android:hue-rotate-90" label="android hue" />
          <FilterTile cls="android:invert" label="android invert" />
          <FilterTile cls="android:sepia" label="android sepia" />
          <FilterTile cls="android:saturate-150" label="android saturate" />
          <FilterTile cls="android:drop-shadow-lg" label="android shadow" />
        </View>
      </Section>
    </Screen>
  );
}
