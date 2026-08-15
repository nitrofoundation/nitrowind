import { Text, View } from '@nitrofoundation/nitrowind';

export default function NativeHomePage() {
  return (
    <View className="flex-1 justify-center bg-slate-50 p-8">
      <View className="rounded-2xl bg-white p-6">
        <Text className="text-3xl font-bold text-slate-950">Expo native uses Nitrowind primitives</Text>
        <Text className="mt-4 text-slate-600">DOM JSX is intentionally not transformed on native yet.</Text>
      </View>
    </View>
  );
}
