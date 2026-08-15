import { Platform } from 'react-native';
import { ScrollView, Text, View } from '@nitrofoundation/nitrowind';

const CODE = `.feed { scroll-timeline: --feed block; }
.card {
  animation: reveal 1s linear both;
  animation-timeline: --feed;
  animation-range: 35% 68%;
}`;

function RevealCard({
  className,
  step,
  title,
  range,
  color,
}: {
  className: string;
  step: string;
  title: string;
  range: string;
  color: string;
}) {
  return (
    <View
      className={`min-h-52 justify-between overflow-hidden rounded-[28px] p-6 ${color} ${className}`}
    >
      <View className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/20" />
      <View className="absolute -bottom-16 -left-8 h-40 w-40 rounded-full bg-black/10" />
      <View className="self-start rounded-full border border-white/30 bg-white/20 px-3 py-1">
        <Text className="text-xs font-extrabold tracking-widest text-white">
          {step}
        </Text>
      </View>
      <View className="gap-2">
        <Text className="text-3xl font-black tracking-tight text-white">
          {title}
        </Text>
        <Text className="font-mono text-sm font-semibold text-white/80">
          animation-range: {range};
        </Text>
      </View>
    </View>
  );
}

export default function ScrollTimelineBasics() {
  const platformLabel =
    Platform.OS === 'web'
      ? 'WEB · CSS'
      : `${Platform.OS.toUpperCase()} · NATIVE`;

  return (
    <View className="flex-1 bg-[#07111f]">
      <ScrollView
        className="scroll-demo-feed flex-1"
        contentContainerClassName="gap-8 px-safe-or-5 pb-safe-offset-16 pt-8"
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
      >
        <View className="z-10 rounded-full bg-[#07111f] py-2">
          <View className="h-1 overflow-hidden rounded-full bg-white/10">
            <View className="scroll-demo-progress h-full w-full rounded-full bg-cyan-300" />
          </View>
        </View>
        <View className="gap-4 pb-12">
          <View className="self-start rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5">
            <Text className="text-xs font-extrabold tracking-widest text-cyan-200">
              {platformLabel}
            </Text>
          </View>
          <Text className="text-5xl font-black leading-[52px] tracking-tight text-white">
            Scroll drives the keyframes.
          </Text>
          <Text className="text-base leading-7 text-slate-300">
            Each card uses a different CSS animation range. Browsers use native
            CSS scroll timelines; iOS and Android use Nitrowind&apos;s native
            driver.
          </Text>
        </View>
        <RevealCard
          className="scroll-reveal-one"
          step="01 · OPACITY"
          title="Fade into focus"
          range="3% 22%"
          color="bg-linear-to-br from-violet-600 to-fuchsia-500"
        />
        <View className="h-28 items-center">
          <View className="h-full w-px bg-white/15" />
        </View>
        <RevealCard
          className="scroll-reveal-two"
          step="02 · TRANSLATE"
          title="Rise with the timeline"
          range="28% 52%"
          color="bg-linear-to-br from-cyan-500 to-blue-700"
        />
        <View className="h-28 items-center">
          <View className="h-full w-px bg-white/15" />
        </View>
        <RevealCard
          className="scroll-reveal-three"
          step="03 · SCALE + ROTATE"
          title="One native transform"
          range="50% 76%"
          color="bg-linear-to-br from-emerald-500 to-teal-700"
        />
        <View className="h-28 items-center">
          <View className="h-full w-px bg-white/15" />
        </View>
        <RevealCard
          className="scroll-reveal-four"
          step="04 · COMPOSE"
          title="No JavaScript listener"
          range="72% 94%"
          color="bg-linear-to-br from-orange-500 to-rose-600"
        />
        <View className="mt-16 gap-4 rounded-3xl border border-white/10 bg-white/5 p-5">
          <Text className="text-lg font-extrabold text-white">The CSS</Text>
          <Text
            selectable
            className="font-mono text-xs leading-5 text-cyan-100"
          >
            {CODE}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
