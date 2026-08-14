/**
 * Effects — the NitroCSS v2 visual-effects milestone, all authored as plain CSS
 * utilities and painted natively (iOS):
 *
 *  - TRUE animated gradient angle: the linear gradient's own angle rotates in
 *    place (native CAGradientLayer start/end points driven per frame), NOT a
 *    translated oversized layer.
 *  - clip-path: polygon / circle / inset masks via CAShapeLayer (no SVG).
 *  - mask-image: native image/gradient masks, including mask-only keyframes
 *    that rotate and pulse the aperture without transforming the host view.
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
          <View className="flex-row items-center justify-center gap-3">
            {/* On a SQUARE box a rotating linear gradient reads perfectly
                uniform. On wide boxes the same constant angular speed looks
                like it surges as the axis crosses vertical — that is linear-
                gradient optics (a browser does the same), not jank. */}
            <View className="btn-gradient-border h-36 w-36 items-center justify-center rounded-3xl animate-gradient-angle-spin">
              <Text className="text-center text-sm font-bold text-on-surface">
                square{'\n'}rotating
              </Text>
            </View>
            <View className="btn-gradient-border h-36 flex-1 items-center justify-center rounded-3xl animate-gradient-angle-spin">
              <Text className="text-center text-sm font-bold text-on-surface">
                wide{'\n'}rotating
              </Text>
            </View>
          </View>
          <Caption>
            background: linear-gradient(…) padding-box, linear-gradient(…)
            border-box · border + angle keyframes. The wide ring appears to
            surge near vertical — constant angular speed, linear-gradient
            optics on a wide box (compare the square).
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
        title="Native masks"
        subtitle="Image and gradient masks clip the whole native view with alpha or luminance semantics. Mask keyframes animate only the aperture."
      >
        <View className="gap-3">
          <View className="flex-row gap-3">
            <View className="h-44 flex-1 items-center justify-center overflow-hidden rounded-3xl bg-sky-100">
              <Text className="text-center text-xs font-extrabold text-sky-900">
                transparent{`\n`}photo border
              </Text>
              <View className="absolute inset-0 bg-mask-photo mask-star-outline-hires" />
            </View>
            <View className="h-44 flex-1 items-center justify-center overflow-hidden rounded-3xl bg-sky-100">
              <Text className="text-center text-xs font-extrabold text-sky-900">
                stationary{`\n`}photo
              </Text>
              <View className="absolute inset-0 bg-mask-photo mask-star-outline-hires animate-mask-star-rotate-pulse" />
            </View>
          </View>
          <Caption>
            image mask · transparent fill · native mask-angle + mask-scale
          </Caption>
          <View className="h-32 items-center justify-center rounded-3xl bg-linear-to-r from-cyan-400 via-violet-500 to-pink-500 mask-[linear-gradient(to_right,transparent,black_25%,black_75%,transparent)]">
            <Text className="text-base font-extrabold text-white">
              alpha · linear
            </Text>
          </View>
          <View className="flex-row gap-3">
            <View className="h-36 flex-1 items-center justify-center rounded-3xl bg-amber-400 mask-[radial-gradient(circle,black_42%,transparent_76%)]">
              <Text className="text-center text-sm font-bold text-slate-950">
                radial{`\n`}mask
              </Text>
            </View>
            <View className="h-36 flex-1 items-center justify-center rounded-3xl bg-sky-500 mask-luminance mask-[linear-gradient(to_bottom,white,black)]">
              <Text className="text-center text-sm font-bold text-white">
                luminance{`\n`}mask
              </Text>
            </View>
          </View>
          <Caption>
            iOS CALayer mask · Android RenderEffect DST_IN (API 31+) · the
            host view never rotates
          </Caption>
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
