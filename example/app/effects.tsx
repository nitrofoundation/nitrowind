/**
 * Effects — the NitroCSS v2 visual-effects milestone, all authored as plain CSS
 * utilities and painted natively (iOS):
 *
 *  - TRUE animated gradient angle: the linear gradient's own angle rotates in
 *    place (native CAGradientLayer start/end points driven per frame), NOT a
 *    translated oversized layer.
 *  - clip-path: polygon / circle / inset masks via CAShapeLayer (no SVG).
 *  - background-image: url(...) painted as a raster layer on the view's own
 *    backing layer (async fetch + cache), with cover / contain sizing.
 *  - text-shadow: single-layer native shadow.
 *  - inline <b> / <strong> / <br /> inside NitroCSS Text.
 */
import { Text, View } from '@nitrofoundation/nitrowind';

import { Caption, Screen, Section } from '../components/ui';

function Tile({ cls, label }: { cls: string; label: string }) {
  return (
    <View className="w-[47%] gap-2">
      <View
        className={`h-28 items-center justify-center rounded-2xl ${cls}`}
      >
        <Text className="text-sm font-bold text-white">{label}</Text>
      </View>
      <Caption>{label}</Caption>
    </View>
  );
}

export default function Effects() {
  return (
    <Screen>
      <Section
        title="Animated gradient angle"
        subtitle="The gradient's own angle rotates natively — same view box, no translated layer."
      >
        <View className="h-44 items-center justify-center overflow-hidden rounded-3xl bg-linear-45 from-fuchsia-500 via-violet-500 to-cyan-400 animate-gradient-angle-spin">
          <Text className="text-base font-extrabold text-white text-drop">
            animate-gradient-angle-spin
          </Text>
        </View>
      </Section>

      <Section
        title="Gradient border"
        subtitle="The web recipe: background padding-box + border-box layers over a transparent border — radius-aware, so rounded-full just works."
      >
        <View className="gap-3">
          <View className="btn-gradient-border h-14 items-center justify-center rounded-full">
            <Text className="text-base font-bold text-on-surface">
              rounded-full pill
            </Text>
          </View>
          <View className="btn-gradient-border h-28 items-center justify-center rounded-2xl">
            <Text className="text-sm font-bold text-on-surface">
              rounded-2xl card
            </Text>
          </View>
          <Caption>
            background: linear-gradient(…) padding-box, linear-gradient(…)
            border-box · border: 4px solid transparent
          </Caption>
        </View>
      </Section>

      <Section
        title="clip-path"
        subtitle="polygon / circle / inset masks — native CAShapeLayer, no react-native-svg."
      >
        <View className="flex-row flex-wrap gap-3">
          <Tile cls="bg-violet-500 clip-triangle" label="triangle" />
          <Tile cls="bg-rose-500 clip-hexagon" label="hexagon" />
          <Tile cls="bg-emerald-500 clip-rhombus" label="rhombus" />
          <Tile cls="bg-sky-500 clip-circle" label="circle" />
        </View>
      </Section>

      <Section
        title="clip-path on a gradient"
        subtitle="Effects compose: a masked, gradient-filled surface."
      >
        <View className="h-40 items-center justify-center bg-linear-to-br from-amber-400 to-rose-500 clip-notch">
          <Text className="text-lg font-extrabold text-white text-drop">
            inset round 24px
          </Text>
        </View>
      </Section>

      <Section
        title="background-image"
        subtitle="Real url(...) raster painted on the view's own layer — cover & contain."
      >
        <View className="flex-row flex-wrap gap-3">
          <View className="w-[47%] gap-2">
            <View className="h-32 items-end justify-end rounded-2xl overflow-hidden bg-photo p-2">
              <Text className="text-xs font-bold text-white text-drop">cover</Text>
            </View>
            <Caption>size: cover</Caption>
          </View>
          <View className="w-[47%] gap-2">
            <View className="h-32 items-center justify-center rounded-2xl overflow-hidden bg-surface-elevated bg-photo-contain" />
            <Caption>size: contain</Caption>
          </View>
        </View>
      </Section>

      <Section
        title="text-shadow"
        subtitle="Single-layer native text shadow (RN textShadow*)."
      >
        <View className="gap-3 rounded-2xl bg-primary p-5">
          <Text className="text-2xl font-black text-white text-glow">
            Neon glow
          </Text>
          <Text className="text-2xl font-black text-white text-drop">
            Drop shadow
          </Text>
        </View>
      </Section>

      <Section
        title="Inline rich text"
        subtitle="<b> / <strong> / <br /> inside NitroCSS Text — JSX children, not HTML strings."
      >
        <View className="rounded-2xl bg-surface-elevated p-5">
          <Text className="text-base text-on-surface">
            The quick <b>brown fox</b> jumps over the{' '}
            <strong>lazy dog</strong>.<br />
            Second line after an inline <b>{'<br />'}</b>.
          </Text>
        </View>
      </Section>
    </Screen>
  );
}
