/**
 * Copyable DX example. It intentionally uses a dependency already present in
 * the example app; presets themselves never import optional packages.
 */
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import {
  Text,
  View,
  withInteropPreset,
} from '@nitrofoundation/nitrowind';

const StyledGestureScrollView = withInteropPreset(
  GestureScrollView,
  'gestureHandlerScrollView',
);

export function PresetExample() {
  return (
    <StyledGestureScrollView
      className="flex-1 bg-surface"
      contentContainerClassName="gap-4 p-4 pt-safe"
    >
      <View className="rounded-2xl bg-primary p-4">
        <Text className="font-bold text-white">Preset-powered scroll view</Text>
      </View>
    </StyledGestureScrollView>
  );
}

// Generate editor/CI artifacts for this project from the repository root:
// yarn nitrowind autocomplete --cwd apps/example --input global.css
