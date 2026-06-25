/**
 * Transforms & shadows — rotate / scale / translate / skew (folded into a native
 * transform array by the compiler) plus box-shadow utilities resolved by the
 * native shadow parser.
 */
import { Text, View } from "nitrowind";

import { Caption, Screen, Section } from "../components/ui";

function Tile({
  className,
  label,
  shadow,
}: {
  className: string;
  label: string;
  shadow?: boolean;
}) {
  return (
    <View className="w-[30%] items-center gap-3 py-2">
      <View
        className={`h-14 w-14 items-center justify-center rounded-xl ${
          shadow ? "bg-surface-elevated" : "bg-primary"
        } ${className}`}
      >
        {shadow ? null : <View className="h-3 w-3 rounded-full bg-white/90" />}
      </View>
      <Caption>{label}</Caption>
    </View>
  );
}

export default function Transforms() {
  return (
    <Screen>
      <Section
        title="Box shadow"
        subtitle="shadow-* maps to native shadow props"
      >
        <View className="flex-row flex-wrap gap-3">
          <Tile className="shadow-sm" label="shadow-sm" shadow />
          <Tile className="shadow-md" label="shadow-md" shadow />
          <Tile
            className="shadow-lg shadow-accent"
            label="shadow-lg accent"
            shadow
          />
          <Tile className="shadow-xl" label="shadow-xl" shadow />
        </View>
      </Section>

      <Section title="Rotate" subtitle="rotate-* and -rotate-*">
        <View className="flex-row flex-wrap gap-3">
          <Tile className="rotate-6" label="rotate-6" />
          <Tile className="-rotate-6" label="-rotate-6" />
          <Tile className="rotate-45" label="rotate-45" />
        </View>
      </Section>

      <Section title="Scale" subtitle="scale-* (uniform or per-axis)">
        <View className="flex-row flex-wrap gap-3">
          <Tile className="scale-90" label="scale-90" />
          <Tile className="scale-110" label="scale-110" />
          <Tile className="scale-125" label="scale-125" />
        </View>
      </Section>

      <Section title="Translate & skew" subtitle="translate-* and skew-*">
        <View className="flex-row flex-wrap gap-3">
          <Tile className="translate-x-3" label="translate-x-3" />
          <Tile className="-translate-y-2" label="-translate-y-2" />
          <Tile className="skew-x-6" label="skew-x-6" />
        </View>
      </Section>

      <Section
        title="Combined"
        subtitle="Several transforms compose into one matrix"
      >
        <View className="flex-row flex-wrap gap-3">
          <Tile className="rotate-6 scale-110" label="rotate + scale" />
          <Tile className="-rotate-12 translate-x-2" label="rotate + move" />
          <Tile className="scale-110 skew-y-6" label="scale + skew" />
        </View>
      </Section>

      <Text className="text-xs text-muted">
        Transforms are folded into a single native transform array at build
        time; box-shadows map to the platform shadow properties.
      </Text>
    </Screen>
  );
}
