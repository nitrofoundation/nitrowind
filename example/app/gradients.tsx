/**
 * Gradients — linear, radial and an animated linear gradient, all compiled from
 * Tailwind gradient utilities (`bg-linear-*`, `bg-radial*`, `from-*`, `via-*`,
 * `to-*`) and painted as a layer ON THE VIEW ITSELF (a CAGradientLayer
 * installed on the view's own backing layer on iOS — exactly like RN's
 * `experimental_backgroundImage` path, but engine-owned). There is NO child
 * component and no `react-native-linear-gradient`: nitrowind folds the split
 * `--tw-gradient-*` utilities into one compact numeric descriptor at resolve
 * time, the C++ engine registers `tag → descriptor`, and the native applier
 * (re)paints on every mount transaction — so culled/recycled views get their
 * gradient back, and theme/scheme changes re-color NATIVELY, no JS re-render.
 *
 * The animated tile can't interpolate a gradient's own geometry yet, so it
 * sweeps an oversized gradient view via the `animate-gradient-shift` CSS
 * keyframe (see `global.css`) — the same Reanimated native CSS-animation path
 * as `animate-*`; the gradient layer rides on the translated view.
 */
import { Text, View } from 'nitrowind';

import { Caption, Screen, Section, ThemeToggle } from '../components/ui';

const LINEAR = [
  { cls: 'bg-linear-to-r from-fuchsia-500 to-cyan-400', label: 'to-r' },
  { cls: 'bg-linear-to-br from-indigo-500 via-purple-500 to-pink-500', label: 'to-br · via' },
  { cls: 'bg-linear-to-t from-emerald-400 to-lime-300', label: 'to-t' },
  { cls: 'bg-linear-45 from-amber-400 to-rose-600', label: '45°' },
];

const RADIAL = [
  { cls: 'bg-radial from-white to-sky-500', label: 'center' },
  { cls: 'bg-radial-[at_25%_25%] from-yellow-300 to-orange-600', label: 'at 25% 25%' },
  { cls: 'bg-radial from-pink-400 via-purple-500 to-indigo-700', label: 'via' },
  { cls: 'bg-radial-[at_50%_100%] from-teal-300 to-blue-700', label: 'at 50% 100%' },
];

function GradientTile({ cls, label }: { cls: string; label: string }) {
  return (
    <View className="w-[47%] gap-2">
      <View className={`h-24 items-center justify-center rounded-2xl ${cls}`}>
        <Text className="text-xs font-semibold text-white/90">{label}</Text>
      </View>
      <Caption>{label}</Caption>
    </View>
  );
}

/**
 * The web "animated gradient" trick: an oversized gradient layer whose position
 * sweeps diagonally. RN can't animate `background-position`, so the equivalent
 * effect comes from translating an oversized (180%) gradient layer via the
 * `animate-gradient-shift` keyframe — the overhang keeps the frame filled as it
 * moves. Uses theme tokens (`from-primary` / `to-danger`) so it also adapts to
 * the current theme.
 */
function AnimatedGradient() {
  return (
    <View className="h-40 overflow-hidden items-center justify-center rounded-3xl bg-slate-900">
      <View className="absolute h-[180%] w-[180%] animate-gradient-shift bg-linear-[144deg] from-primary via-cyan-400 to-danger" />
      <Text className="text-sm font-bold text-white">animate-gradient-shift</Text>
    </View>
  );
}

export default function Gradients() {
  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-muted">
          Toggle theme — themed gradients update natively
        </Text>
        <ThemeToggle />
      </View>

      <Section
        title="Linear"
        subtitle="bg-linear-* direction + from/via/to stops → the view's own native gradient layer."
      >
        <View className="flex-row flex-wrap gap-4">
          {LINEAR.map((g) => (
            <GradientTile key={g.label} cls={g.cls} label={g.label} />
          ))}
        </View>
      </Section>

      <Section
        title="Animated"
        subtitle="RN can't animate background-position, so an oversized gradient layer is translated via a CSS keyframe for the same sweep."
      >
        <AnimatedGradient />
      </Section>

      <Section
        title="Radial"
        subtitle="bg-radial / bg-radial-[at_x_y] with the same from/via/to stops."
      >
        <View className="flex-row flex-wrap gap-4">
          {RADIAL.map((g) => (
            <GradientTile key={g.label} cls={g.cls} label={g.label} />
          ))}
        </View>
      </Section>
    </Screen>
  );
}
