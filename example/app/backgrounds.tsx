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
        title="Filters"
        subtitle="Native filters use React Native's New Architecture filter prop."
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
