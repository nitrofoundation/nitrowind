import { Text, View } from '@nitrofoundation/nitrowind';

import { Caption, Screen, Section } from '../components/ui';

function Photo({ className, label }: { className?: string; label: string }) {
  return (
    <View className="gap-2">
      <View
        className={`h-52 items-center justify-end overflow-hidden rounded-3xl bg-mask-photo p-4 ${className ?? ''}`}
      >
        <Text className="rounded-lg bg-black/60 px-3 py-1 text-sm font-bold text-white">
          {label}
        </Text>
      </View>
      <Caption>{label}</Caption>
    </View>
  );
}

export default function Masking() {
  return (
    <Screen>
      <Section
        title="Animated photo border"
        subtitle="CSS keyframes rotate and pulse only the native mask aperture. The photo and its view remain stationary."
      >
        <View className="items-center rounded-3xl bg-surface-elevated p-5">
          <View className="h-64 w-64 items-center justify-center rounded-3xl bg-sky-100">
            <Text className="text-center text-base font-extrabold text-sky-900">
              stationary behind{`\n`}the animated mask
            </Text>
            <View className="absolute inset-0 bg-mask-photo mask-star-outline-hires animate-mask-star-rotate-pulse" />
          </View>
        </View>
        <Caption>@keyframes · --mask-angle + --mask-scale · stationary photo</Caption>
      </Section>

      <Section
        title="Photo border · transparent fill"
        subtitle="Only the thick star outline is painted with the photo. The center remains genuinely transparent and reveals the content behind it."
      >
        <View className="items-center rounded-3xl bg-surface-elevated p-5">
          <View className="h-64 w-64 items-center justify-center rounded-3xl bg-sky-100">
            <Text className="text-center text-base font-extrabold text-sky-900">
              visible through{`\n`}the transparent fill
            </Text>
            <View className="absolute inset-0 bg-mask-photo mask-star-outline-hires" />
          </View>
        </View>
        <Caption>
          960px vector-derived mask · transparent center · Star Outline by JonishN, CC BY-SA 4.0
        </Caption>
      </Section>

      <Section
        title="Bordered star mask"
        subtitle="Two nested image masks create a gold star border around the masked photo—no SVG or canvas view."
      >
        <View className="items-center rounded-3xl bg-surface-elevated p-5">
          <View className="h-64 w-64 items-center justify-center bg-amber-400 mask-star-stretch">
            <View className="h-[236px] w-[236px] items-center justify-center bg-mask-photo mask-star-stretch">
              <Text className="rounded-lg bg-black/60 px-3 py-1 text-base font-extrabold text-white">
                native mask
              </Text>
            </View>
          </View>
        </View>
        <Caption>transparent PNG · stretch · centered · nested gold border</Caption>
      </Section>

      <Section
        title="mask-image: url(…)"
        subtitle="The photo and its children are clipped by the alpha channel of a PNG, entirely in the native renderer."
      >
        <Photo className="mask-logo-no-repeat" label="no-repeat · default top-left" />
        <Photo className="mask-logo-center" label="no-repeat · centered" />
      </Section>

      <Section
        title="Original image"
        subtitle="The same native background image with no mask applied."
      >
        <Photo label="original" />
      </Section>

      <Section
        title="Supported controls"
        subtitle="Image masks use the same independently composable CSS properties on both platforms."
      >
        <View className="gap-2 rounded-2xl bg-surface-elevated p-4">
          <Text className="font-semibold text-on-surface">mask-repeat: no-repeat / repeat / repeat-x / repeat-y</Text>
          <Text className="font-semibold text-on-surface">mask-position: keywords and percentages</Text>
          <Text className="font-semibold text-on-surface">mask-size: auto / cover / contain / 100% 100%</Text>
          <Text className="font-semibold text-on-surface">
            gradient mask-mode: alpha / luminance · PNG masks use alpha
          </Text>
        </View>
      </Section>
    </Screen>
  );
}
