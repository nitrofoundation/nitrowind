/**
 * Full-screen native gradient composition inspired by Apple's soft, luminous
 * system artwork. Every colored surface is a Nitrowind gradient painted on its
 * own native view; CSS keyframes move the oversized radial layers without a JS
 * animation loop.
 */
import { useNavigation } from '@react-navigation/native';
import { Pressable, Text, View } from '@nitrofoundation/nitrowind';

export default function AppleGradient() {
  const navigation = useNavigation();

  return (
    <View className="flex-1 overflow-hidden bg-[#08051f]">
      <View className="absolute inset-0 bg-linear-45 from-[#071f5d] via-[#5925b8] to-[#ff4f9a] animate-gradient-angle-spin" />

      <View className="absolute -left-[35%] -top-[18%] h-[78%] w-[145%] rounded-full bg-radial-[circle] from-[#7df9ff] via-[#248cff]/90 to-transparent animate-apple-float-a" />
      <View className="absolute -right-[48%] top-[8%] h-[72%] w-[145%] rounded-full bg-radial-[circle] from-[#ffb6f2] via-[#f43f9e]/85 to-transparent animate-apple-float-b" />
      <View className="absolute -bottom-[32%] -left-[18%] h-[76%] w-[138%] rounded-full bg-radial-[ellipse] from-[#ffe27a] via-[#ff6b6b]/75 to-transparent animate-apple-float-c" />

      <View className="absolute inset-0 bg-linear-to-b from-white/10 via-transparent to-[#08051f]/35" />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        className="absolute left-5 top-14 z-10 h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-black/20 active:bg-black/35"
        onPress={() => navigation.goBack()}
      >
        <Text className="text-3xl font-light text-white">‹</Text>
      </Pressable>

      <View className="flex-1 items-center justify-center px-8">
        <View className="items-center gap-4 rounded-[32px] border border-white/20 bg-black/15 px-8 py-10">
          <Text className="text-center text-4xl font-black tracking-tight text-white text-drop">
            Native Aurora
          </Text>
          <Text className="text-center text-base leading-6 text-white/80">
            Layered native gradients animated entirely with CSS keyframes.
          </Text>
          <View className="mt-2 rounded-full border border-white/30 bg-white/15 px-5 py-3">
            <Text className="text-sm font-bold text-white">
              No JavaScript animation loop
            </Text>
          </View>
        </View>
      </View>

      <Text className="absolute bottom-10 self-center text-xs font-semibold tracking-widest text-white/60">
        NITROWIND
      </Text>
    </View>
  );
}
