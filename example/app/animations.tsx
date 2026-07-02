/**
 * Animations — Reanimated entering/exiting/layout presets and pure-CSS
 * `@keyframes` loops, all driven by class names. Reanimated is an optional peer
 * dependency: without it these degrade to plain views (no animation, no crash).
 */
import { useState } from "react";
import { Pressable, Text, View } from "@nitrofoundation/nitrowind";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Card, Caption, Screen, Section } from "../components/ui";

const ENTERING = [
  { cls: "entering-fade-in-down", label: "fade-in-down" },
  { cls: "entering-zoom-in", label: "zoom-in" },
  { cls: "entering-slide-in-left", label: "slide-in-left" },
  { cls: "entering-bounce-in", label: "bounce-in" },
  { cls: "entering-flip-in-easy-x", label: "flip-in-x" },
  { cls: "entering-rotate-in-down-left", label: "rotate-in" },
];

const LOOPS = [
  { cls: "animate-wiggle", label: "wiggle" },
  { cls: "animate-float", label: "float" },
  { cls: "animate-breathe", label: "breathe" },
  { cls: "animate-heartbeat", label: "heartbeat" },
  { cls: "animate-tada", label: "tada" },
  { cls: "animate-swing", label: "swing" },
  { cls: "animate-jello", label: "jello" },
  { cls: "animate-tilt", label: "tilt" },
];

const AnimatedView = Animated.createAnimatedComponent(View);

function PillButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <View className="self-start rounded-full bg-primary px-4 py-2">
        <Text className="text-sm font-semibold text-primary-foreground">
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default function Animations() {
  const [replayKey, setReplayKey] = useState(0);

  return (
    <Screen>
      <Section
        title="Entering"
        subtitle="Entering animations baked from class names. Tap Replay to remount them."
      >
        <PillButton label="Replay" onPress={() => setReplayKey((k) => k + 1)} />
        <View className="flex-row flex-wrap gap-3">
          {ENTERING.map((a) => (
            <View key={`${replayKey}-${a.cls}`} className="w-[30%] gap-2">
              <View
                className={`h-16 items-center justify-center rounded-2xl bg-violet-500 entering-duration-500 ${a.cls}`}
              >
                <View className="h-4 w-4 rounded-full bg-white/90" />
              </View>
              <Caption>{a.label}</Caption>
            </View>
          ))}
        </View>
      </Section>

      <Section
        title="Looping keyframes"
        subtitle="Pure CSS @keyframes run natively by Reanimated's CSS engine — no JS driver."
      >
        <View className="flex-row flex-wrap gap-3">
          {LOOPS.map((a) => (
            <View key={a.cls} className="w-[22%] gap-2">
              <View
                className={`h-16 items-center justify-center rounded-2xl bg-surface-elevated ${a.cls}`}
              >
                <View className="h-4 w-4 rounded-full bg-primary" />
              </View>
              <Caption>{a.label}</Caption>
            </View>
          ))}
        </View>
      </Section>

      <ClassTransition />
      <TapAnimationReanimated />
      <EnterExit />
    </Screen>
  );
}

const ClassTransition = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Section
      title="Class transitions"
      subtitle="transition-all, transition-colors, duration and easing are applied by Reanimated."
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => setExpanded((v) => !v)}
      >
        <Card className="min-h-48 justify-center gap-3 border-0">
          <View
            className={
              expanded
                ? "h-32 w-full items-center justify-center rounded-xl bg-amber-500 transition-all duration-1000 ease-in-out"
                : "h-16 w-1/2 items-center justify-center rounded-xl bg-emerald-500 transition-all duration-1000 ease-in-out"
            }
          >
            <Text className="font-semibold text-white">transition-all</Text>
          </View>
          <View
            className={
              expanded
                ? "h-14 w-full items-center justify-center rounded-xl bg-violet-500 transition-colors duration-300 ease-in-out"
                : "h-14 w-full items-center justify-center rounded-xl bg-rose-500 transition-colors duration-300 ease-in-out"
            }
          >
            <Text className="font-semibold text-white">transition-colors</Text>
          </View>
        </Card>
      </Pressable>
    </Section>
  );
};

const TapAnimationReanimated = () => {
  const progress = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    height: 64 + progress.value * 64,
    width: `${50 + progress.value * 50}%`,
  }));

  return (
    <Section
      title="Tap resize shared value"
      subtitle="Reanimated changes width and height on the UI thread without React state."
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          progress.value = withTiming(progress.value === 0 ? 1 : 0, {
            duration: 260,
          });
        }}
      >
        <Card className="min-h-40 justify-center border-0">
          <AnimatedView
            className="items-center justify-center rounded-xl bg-emerald-500"
            style={animatedStyle}
          >
            <Text className="font-semibold text-white">Tap to resize</Text>
          </AnimatedView>
        </Card>
      </Pressable>
    </Section>
  );
};

const EnterExit = () => {
  const [showExit, setShowExit] = useState(true);

  return (
    <Section
      title="Exiting"
      subtitle="exiting-* animations play as a node unmounts."
    >
      <PillButton
        label={showExit ? "Hide" : "Show"}
        onPress={() => setShowExit((v) => !v)}
      />
      {showExit ? (
        <View className="h-20 items-center justify-center rounded-2xl bg-rose-500 entering-fade-in-up exiting-fade-out-down entering-duration-300">
          <Text className="font-semibold text-white">Goodbye animation</Text>
        </View>
      ) : null}
    </Section>
  );
};
