/**
 * Layout & Platform — flexbox direction, alignment, gap and spacing, plus
 * platform variants (`ios:` / `android:`) and the safe-area utilities the
 * engine resolves against live window insets.
 */
import { Platform } from "react-native";
import { Text, View } from "nitrowind";

import { Card, Caption, Screen, Section } from "../components/ui";
function Box({ className = "" }: { className?: string }) {
  return <View className={`h-10 w-10 rounded-lg bg-primary ${className}`} />;
}

export default function Layout() {
  return (
    <Screen>
      <Section title="Direction" subtitle="flex-row and flex-col with gap">
        <Card className="gap-3">
          <View className="flex-row gap-2">
            <Box />
            <Box className="bg-accent" />
            <Box className="bg-emerald-500" />
          </View>
          <View className="flex-col gap-2 self-start">
            <Box />
            <Box className="bg-accent" />
          </View>
        </Card>
      </Section>

      <Section title="Justify" subtitle="justify-* on the main axis">
        <View className="gap-2">
          <Card className="flex-row justify-between">
            <Box />
            <Box className="bg-accent" />
            <Box className="bg-emerald-500" />
          </Card>
          <Card className="flex-row justify-center gap-2">
            <Box />
            <Box className="bg-accent" />
          </Card>
          <Card className="flex-row justify-around">
            <Box />
            <Box className="bg-accent" />
            <Box className="bg-emerald-500" />
          </Card>
        </View>
      </Section>

      <Section title="Align" subtitle="items-* on the cross axis">
        <Card className="h-24 flex-row items-center justify-between">
          <Box className="self-start" />
          <Box className="bg-accent" />
          <Box className="self-end bg-emerald-500" />
        </Card>
      </Section>

      <Section
        title="Platform variants"
        subtitle="ios: / android: pick a value per OS"
      >
        <Card>
          <Text className="text-lg font-bold text-on-surface ios:text-sky-500 android:text-emerald-600">
            {Platform.select({
              ios: "Running on iOS",
              android: "Running on Android",
              default: "Running on this platform",
            })}
          </Text>
          <Text className="mt-1 text-sm text-muted">
            The color above is chosen by a platform variant, resolved natively.
          </Text>
        </Card>
      </Section>

      <Section title="Safe area" subtitle="Insets feed the engine directly">
        <Caption>
          This screen&apos;s padding uses px-safe-or-5 / pb-safe-offset-10,
          resolved against live window insets — try rotating the device.
        </Caption>
      </Section>
    </Screen>
  );
}
