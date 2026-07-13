/**
 * Background Image — real `background-image: url(...)` rasters painted natively
 * (iOS) on each view's own backing layer (async fetch + decoded-image cache),
 * with no extra `<Image>` child.
 *
 *  - background-size: cover / contain / stretch (100% 100%)
 *  - background-repeat: repeat / repeat-x / repeat-y — a small tile image is
 *    tiled at its native size across the box (CSS `background-size: auto`) via
 *    native CoreAnimation tiling, no `<Image>` grid.
 */
import { Text, View } from '@nitrofoundation/nitrowind';

import { Caption, Screen, Section } from '../components/ui';

function Tile({
  cls,
  label,
  labelClass = 'text-white text-drop',
}: {
  cls: string;
  label: string;
  labelClass?: string;
}) {
  return (
    <View className="w-[47%] gap-2">
      <View
        className={`h-32 items-center justify-center rounded-2xl overflow-hidden ${cls}`}
      >
        <Text className={`text-xs font-bold ${labelClass}`}>{label}</Text>
      </View>
      <Caption>{label}</Caption>
    </View>
  );
}

/** A pill so the label stays readable over a busy tiled background. */
function Pill({ children }: { children: string }) {
  return (
    <Text className="rounded-lg bg-black/50 px-3 py-1 text-sm font-bold text-white">
      {children}
    </Text>
  );
}

export default function BackgroundImage() {
  return (
    <Screen>
      <Section
        title="background-size"
        subtitle="One url(...), different fits — the raster paints on the view's own layer, no <Image> child."
      >
        <View className="flex-row flex-wrap gap-3">
          <Tile cls="bg-photo" label="cover" />
          <Tile cls="bg-surface-elevated bg-photo-contain" label="contain" />
          <Tile cls="bg-photo-stretch" label="stretch (100% 100%)" />
          <Tile
            cls="bg-surface-elevated"
            label="(no image)"
            labelClass="text-muted"
          />
        </View>
      </Section>

      <Section
        title="background-repeat"
        subtitle="A small tile image repeated at its native size across the box — native CoreAnimation tiling, no <Image> grid."
      >
        <View className="gap-3">
          <View className="gap-2">
            <View className="h-44 items-center justify-center rounded-2xl overflow-hidden bg-tile">
              <Pill>repeat</Pill>
            </View>
            <Caption>repeat — tiles both axes</Caption>
          </View>

          <View className="flex-row flex-wrap gap-3">
            <View className="w-[47%] gap-2">
              <View className="h-32 items-center justify-center rounded-2xl overflow-hidden bg-surface-elevated bg-tile-x">
                <Pill>repeat-x</Pill>
              </View>
              <Caption>repeat-x — one row</Caption>
            </View>
            <View className="w-[47%] gap-2">
              <View className="h-32 items-center justify-center rounded-2xl overflow-hidden bg-surface-elevated bg-tile-y">
                <Pill>repeat-y</Pill>
              </View>
              <Caption>repeat-y — one column</Caption>
            </View>
          </View>
        </View>
      </Section>
    </Screen>
  );
}
