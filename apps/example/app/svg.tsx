/**
 * SVG — className-styled `react-native-svg` via the `/nitrowind/svg` preset.
 *
 * Every element below is a pre-wrapped react-native-svg primitive: `className`
 * resolves through the nitrowind engine and the svg paint values are hoisted
 * onto the props react-native-svg actually paints from — `fill-*` → `fill`,
 * `stroke-*` → `stroke`, `stroke-2` → `strokeWidth`, `opacity-*` → `opacity`.
 * Theme tokens work too (`fill-primary`), so toggling the theme restyles the
 * icons. Sizing stays on `style` (`h-*` / `w-*` on the `<Svg>` root).
 */
import type { ReactNode } from 'react';
import { Text, View } from '@nitrofoundation/nitrowind';
import { Circle, Line, Path, Polygon, Rect, Svg } from "@nitrofoundation/nitrowind/svg';

import { Caption, Screen, Section, ThemeToggle } from '../components/ui';

const HEART =
  'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
const BOLT = 'M13 2L3 14h7l-1 8 10-12h-7l1-8z';
const STAR =
  '12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26';

function IconTile({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View className="w-[30%] items-center gap-2 rounded-2xl border border-border bg-surface-elevated p-4">
      {children}
      <Caption>{label}</Caption>
    </View>
  );
}

export default function SvgScreen() {
  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-muted">
          Toggle theme — `fill-primary` icons restyle
        </Text>
        <ThemeToggle />
      </View>

      <Section
        title="Fill"
        subtitle="fill-* utilities hoist onto the svg `fill` prop (theme tokens included)."
      >
        <View className="flex-row flex-wrap gap-4">
          <IconTile label="fill-primary">
            <Svg viewBox="0 0 24 24" className="h-10 w-10">
              <Path d={HEART} className="fill-primary" />
            </Svg>
          </IconTile>
          <IconTile label="fill-accent">
            <Svg viewBox="0 0 24 24" className="h-10 w-10">
              <Path d={BOLT} className="fill-accent" />
            </Svg>
          </IconTile>
          <IconTile label="fill-amber-400">
            <Svg viewBox="0 0 24 24" className="h-10 w-10">
              <Polygon points={STAR} className="fill-amber-400" />
            </Svg>
          </IconTile>
        </View>
      </Section>

      <Section
        title="Stroke"
        subtitle="stroke-<color> + stroke-<n> become the `stroke` / `strokeWidth` props."
      >
        <View className="flex-row flex-wrap gap-4">
          <IconTile label="stroke-2">
            <Svg viewBox="0 0 24 24" className="h-10 w-10">
              <Path
                d={HEART}
                className="fill-none stroke-rose-500 stroke-2"
              />
            </Svg>
          </IconTile>
          <IconTile label="stroke-primary">
            <Svg viewBox="0 0 24 24" className="h-10 w-10">
              <Circle
                cx={12}
                cy={12}
                r={9}
                className="fill-none stroke-primary stroke-2"
              />
              <Line
                x1={12}
                y1={7}
                x2={12}
                y2={13}
                className="stroke-primary stroke-2"
              />
            </Svg>
          </IconTile>
          <IconTile label="fill + stroke">
            <Svg viewBox="0 0 24 24" className="h-10 w-10">
              <Rect
                x={4}
                y={4}
                width={16}
                height={16}
                rx={4}
                className="fill-success stroke-emerald-900 stroke-2"
              />
            </Svg>
          </IconTile>
        </View>
      </Section>

      <Section
        title="Opacity"
        subtitle="opacity-* hoists to the `opacity` prop; per-element, not per-view."
      >
        <View className="flex-row items-center gap-4 rounded-2xl border border-border bg-surface-elevated p-4">
          <Svg viewBox="0 0 24 24" className="h-10 w-10">
            <Path d={BOLT} className="fill-danger" />
          </Svg>
          <Svg viewBox="0 0 24 24" className="h-10 w-10">
            <Path d={BOLT} className="fill-danger opacity-50" />
          </Svg>
          <Svg viewBox="0 0 24 24" className="h-10 w-10">
            <Path d={BOLT} className="fill-danger opacity-25" />
          </Svg>
        </View>
        <Caption>opacity-100 / opacity-50 / opacity-25</Caption>
      </Section>
    </Screen>
  );
}
