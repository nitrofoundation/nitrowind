/**
 * Container Queries — the headline native feature.
 *
 * A `@container` View's measured size is read *after layout* by the C++ Fabric
 * layout observer (a `UIManagerMountHook`), which feeds it back into the engine.
 * Descendants gated on the container size (`@min-[..]`, `@max-[..]`) are
 * re-resolved and committed straight to the ShadowTree — no
 * `useWindowDimensions`, no `onLayout`, no React re-render.
 *
 * Resize the container with the buttons below and watch the children respond.
 */
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  Pressable,
  Text,
  View,
  setNativeProps,
} from '@nitrofoundation/nitrowind';

import { Caption, Card, Screen, Section } from '../components/ui';

const WIDTHS = [
  { px: 200, height: 120 },
  { px: 280, height: 150 },
  { px: 360, height: 190 },
];

export default function Containers() {
  const [webSize, setWebSize] = useState<(typeof WIDTHS)[number]>(WIDTHS[1]!);
  const layoutContainerRef = useRef<any>(null);
  const colorContainerRef = useRef<any>(null);
  const namedContainerRef = useRef<any>(null);

  const setContainerSize = useCallback((width: number, height: number) => {
    if (Platform.OS === 'web') {
      setWebSize({ px: width, height });
      return;
    }

    const style = { width };
    setNativeProps(layoutContainerRef.current, { style });
    setNativeProps(colorContainerRef.current, { style });
    setNativeProps(namedContainerRef.current, { style: { width, height } });
  }, []);

  return (
    <Screen>
      <Section
        title="Resize the container"
        subtitle="The same children re-style themselves from the container's measured width."
      >
        <View className="flex-row gap-2">
          {WIDTHS.map(w => (
            <Pressable
              key={w.px}
              accessibilityRole="button"
              onPress={() => setContainerSize(w.px, w.height)}
              className="rounded-full border border-border bg-surface-elevated px-4 py-2"
            >
              <Text className="text-sm font-semibold text-on-surface">
                {w.px}px
              </Text>
            </Pressable>
          ))}
        </View>
      </Section>

      <Section
        title="@min / @max"
        subtitle="The text stays mounted while spacing and color respond to width."
      >
        <View
          ref={layoutContainerRef}
          style={Platform.OS === 'web' ? { width: webSize.px } : undefined}
          className="@container w-70 self-center rounded-2xl border border-border bg-surface-elevated p-4"
        >
          <View className="flex-col gap-3 @min-[280px]:gap-4">
            <View className="self-start rounded-xl bg-primary px-3 py-2 @min-[280px]:bg-accent">
              <Text className="text-sm font-semibold text-primary-foreground">
                Adapts natively
              </Text>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-sm leading-5 text-muted @min-[280px]:text-on-surface">
                Detail text remains visible while native width changes restyle
                this card.
              </Text>
            </View>
          </View>
        </View>
      </Section>

      <Section
        title="Size-based color"
        subtitle="Background flips once the container passes 300px"
      >
        <View
          ref={colorContainerRef}
          style={Platform.OS === 'web' ? { width: webSize.px } : undefined}
          className="@container w-70 self-center rounded-2xl border border-border bg-surface-elevated p-4"
        >
          <View className="h-14 items-center justify-center rounded-xl bg-emerald-500 @min-[300px]:bg-amber-500">
            <Text className="text-sm font-semibold text-white">
              green &lt; 300px &lt;= amber
            </Text>
          </View>
        </View>
      </Section>

      {Platform.OS === 'web' ? (
        <Section
          title="Native parent query"
          subtitle="The parent-* extension remains a native-only Nitrowind feature."
        >
          <Card>
            <Text className="text-sm leading-5 text-muted">
              Browser examples use standards-based @container rules. Open this
              screen on iOS or Android to see [parent-w&gt;=260px] resolve from
              native layout measurements.
            </Text>
          </Card>
        </Section>
      ) : (
        <Section
          title="Auto Size-based color"
          subtitle="The native layout measurement crosses 260px without button taps."
        >
          <View className="self-stretch px-16">
            <View className="@container self-stretch rounded-2xl border border-border bg-surface-elevated p-4">
              <View className="h-14 items-center justify-center rounded-xl bg-emerald-500 [parent-w>=260px]:bg-amber-500">
                <Text className="text-sm font-semibold text-white">
                  green &lt; 260px &lt;= amber
                </Text>
              </View>
            </View>
          </View>
        </Section>
      )}

      <Section
        title="Named container elsewhere"
        subtitle={
          Platform.OS === 'web'
            ? 'The browser uses a standards-based named ancestor container.'
            : 'This receiver is not a child of the measured container.'
        }
      >
        <View className="gap-3">
          <View
            ref={namedContainerRef}
            style={
              Platform.OS === 'web'
                ? { width: webSize.px, height: webSize.height }
                : undefined
            }
            className="@container/remote h-38 w-70 self-center items-center justify-center rounded-2xl border border-border bg-surface-elevated p-4"
          >
            <Text className="text-center text-sm font-semibold text-on-surface">
              remote named container
            </Text>
            <Text className="text-center text-xs text-muted">
              buttons change my width and height
            </Text>
            {Platform.OS === 'web' ? (
              <View className="mt-3 rounded-xl bg-rose-500 px-3 py-2 @min-[300px]/remote:bg-emerald-500">
                <Text className="text-center text-xs font-bold text-white">
                  named descendant reacts at 300px
                </Text>
              </View>
            ) : null}
          </View>

          {Platform.OS !== 'web' ? (
            <View className="rounded-2xl border border-border bg-rose-500 p-4 [cq-h>=170px]/remote:py-7 [cq-w>=300px]/remote:bg-emerald-500">
              <Text className="text-center text-sm font-bold text-white [cq-w>=300px]/remote:text-black">
                sibling reacts to /remote width and height
              </Text>
            </View>
          ) : null}
        </View>
      </Section>

      <Caption>
        Width changes from a button tap; native uses the ShadowTree engine and
        web uses browser container queries.
      </Caption>
    </Screen>
  );
}
