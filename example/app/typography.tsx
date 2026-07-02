/**
 * Typography — sizes, weights, tracking, leading, decoration and text color,
 * all resolved on the native `Text` shadow node.
 */
import { Text, View } from "@nitrofoundation/nitrowind";

import { Card, Screen, Section } from "../components/ui";

export default function Typography() {
  return (
    <Screen>
      <Section title="Size" subtitle="text-xs … text-3xl">
        <Card className="gap-2">
          <Text className="text-xs text-on-surface">
            text-xs — the quick brown fox
          </Text>
          <Text className="text-sm text-on-surface">
            text-sm — the quick brown fox
          </Text>
          <Text className="text-base text-on-surface">
            text-base — the quick brown fox
          </Text>
          <Text className="text-lg text-on-surface">
            text-lg — the quick brown
          </Text>
          <Text className="text-2xl text-on-surface">
            text-2xl — quick brown
          </Text>
          <Text className="text-3xl text-on-surface">text-3xl — quick</Text>
        </Card>
      </Section>

      <Section title="Weight" subtitle="font-light … font-extrabold">
        <Card className="gap-2">
          <Text className="text-lg font-light text-on-surface">font-light</Text>
          <Text className="text-lg font-normal text-on-surface">
            font-normal
          </Text>
          <Text className="text-lg font-semibold text-on-surface">
            font-semibold
          </Text>
          <Text className="text-lg font-bold text-on-surface">font-bold</Text>
          <Text className="text-lg font-extrabold text-on-surface">
            font-extrabold
          </Text>
        </Card>
      </Section>

      <Section
        title="Tracking & leading"
        subtitle="Letter spacing and line height"
      >
        <Card className="gap-2">
          <Text className="text-base tracking-tighter text-on-surface">
            tracking-tighter
          </Text>
          <Text className="text-base tracking-wide text-on-surface">
            tracking-wide
          </Text>
          <Text className="text-base tracking-widest text-on-surface">
            tracking-widest
          </Text>
          <Text className="mt-2 text-base leading-relaxed text-muted">
            leading-relaxed — a longer paragraph wraps across multiple lines so
            the increased line height is clearly visible against the tighter
            defaults.
          </Text>
        </Card>
      </Section>

      <Section title="Style & decoration" subtitle="italic, casing, underline">
        <Card className="gap-2">
          <Text className="text-base italic text-on-surface">italic</Text>
          <Text className="text-base uppercase text-on-surface">uppercase</Text>
          <Text className="text-base capitalize text-on-surface">
            capitalize each word
          </Text>
          <Text className="text-base underline text-on-surface">underline</Text>
          <Text className="text-base line-through text-muted">
            line-through
          </Text>
        </Card>
      </Section>

      <Section title="Color" subtitle="Palette and theme tokens">
        <View className="flex-row flex-wrap gap-x-4 gap-y-2">
          <Text className="text-base font-semibold text-primary">primary</Text>
          <Text className="text-base font-semibold text-accent">accent</Text>
          <Text className="text-base font-semibold text-success">success</Text>
          <Text className="text-base font-semibold text-warning">warning</Text>
          <Text className="text-base font-semibold text-danger">danger</Text>
          <Text className="text-base font-semibold text-muted">muted</Text>
        </View>
      </Section>
    </Screen>
  );
}
