import { Text, View } from '@nitrofoundation/nitrowind';

/**
 * Standalone feature fixture. Add the classes below to global.css when wiring
 * this page into the example navigator; keeping it isolated makes it useful to
 * native snapshot and parser tests without changing the current screen list.
 *
 * .math-card { width: min(92vw, 42rem); padding: clamp(16px, 4cqi, 36px); }
 * .semantic-card {
 *   color: platform-color(labelColor, #111827);
 *   background-color: dynamic-color(#eff6ff, #172554, #fff, #000);
 * }
 * .p3-chip { background-color: color(display-p3 0.2 0.72 1); }
 */
export function CssMathSemanticV4Example() {
  return (
    <View className="@container flex-1 items-center justify-center gap-6 p-4">
      <View className="math-card semantic-card rounded-3xl border">
        <Text className="text-xl font-bold">Runtime CSS math</Text>
        <Text>Viewport, container, variable, and semantic values resolve natively.</Text>
      </View>

      <View className="perspective-near perspective-origin-top-right">
        <View className="p3-chip origin-[50%_50%_24px] transform-3d translate-z-4 rotate-y-12 rounded-2xl p-5 backface-hidden">
          <Text className="font-semibold text-white">P3 + native 3D</Text>
        </View>
      </View>
    </View>
  );
}
