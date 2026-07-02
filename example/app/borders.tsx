/**
 * Borders — widths, colors, radii, styles and per-side borders. Every box is a
 * nitrowind `View`; the border properties are resolved natively from the class
 * names.
 */
import { Text, View } from "@nitrofoundation/nitrowind";

import { Caption, Screen, Section } from "../components/ui";

function Grid({ items }: { items: { cls: string; label: string }[] }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {items.map((item) => (
        <View key={item.label} className="w-[30%] gap-2">
          <View className={`h-16 bg-surface-elevated ${item.cls}`} />
          <Caption>{item.label}</Caption>
        </View>
      ))}
    </View>
  );
}

export default function Borders() {
  return (
    <Screen>
      <Section
        title="Per-side"
        subtitle="border-t / r / b / l and border-x / y"
      >
        <Grid
          items={[
            { cls: "rounded-xl border-l-4 border-accent", label: "border-l-4" },
            { cls: "rounded-xl border-b-4 border-accent", label: "border-b-4" },
            { cls: "rounded-xl border-x-4 border-accent", label: "border-x-4" },
            { cls: "rounded-xl border-y-4 border-accent", label: "border-y-4" },
          ]}
        />
      </Section>

      <Section title="Width" subtitle="border, border-2, border-4, border-8">
        <Grid
          items={[
            { cls: "rounded-xl border border-primary", label: "border" },
            { cls: "rounded-xl border-2 border-primary", label: "border-2" },
            { cls: "rounded-xl border-4 border-primary", label: "border-4" },
            { cls: "rounded-xl border-8 border-primary", label: "border-8" },
          ]}
        />
      </Section>

      <Section title="Color" subtitle="Any palette or theme token via border-*">
        <Grid
          items={[
            { cls: "rounded-xl border-4 border-rose-500", label: "rose-500" },
            { cls: "rounded-xl border-4 border-sky-500", label: "sky-500" },
            {
              cls: "rounded-xl border-4 border-emerald-500",
              label: "emerald-500",
            },
            { cls: "rounded-xl border-4 border-amber-500", label: "amber-500" },
            { cls: "rounded-xl border-4 border-accent", label: "accent" },
            {
              cls: "rounded-xl border-4 border-on-surface",
              label: "on-surface",
            },
          ]}
        />
      </Section>

      <Section title="Radius" subtitle="rounded-none … rounded-full">
        <Grid
          items={[
            { cls: "rounded-none border-2 border-primary", label: "none" },
            { cls: "rounded-md border-2 border-primary", label: "md" },
            { cls: "rounded-xl border-2 border-primary", label: "xl" },
            { cls: "rounded-3xl border-2 border-primary", label: "3xl" },
            { cls: "rounded-full border-2 border-primary", label: "full" },
          ]}
        />
      </Section>

      <Section title="Style" subtitle="solid, dashed, dotted">
        <Grid
          items={[
            {
              cls: "rounded-xl border-4 border-solid border-primary",
              label: "solid",
            },
            {
              cls: "rounded-xl border-4 border-dashed border-primary",
              label: "dashed",
            },
            {
              cls: "rounded-xl border-4 border-dotted border-primary",
              label: "dotted",
            },
          ]}
        />
      </Section>

      <Text className="text-xs text-muted">
        All border properties (width, color, radius, style) resolve in the
        native engine and are committed straight to the ShadowTree.
      </Text>
    </Screen>
  );
}
