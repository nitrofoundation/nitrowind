import { Text, View } from '@nitrofoundation/nitrowind';

type InspectionPreview = {
  className: string;
  executionPath: 'native' | 'javascript';
  unknownRules: string[];
  timing: { inspectorResolveMs: number };
};

/**
 * Standalone feature sample. The app navigator can mount it after the public
 * inspector/accessibility subpath exports are wired.
 */
export function StyleInspectorAndAccessibilityExample({
  inspection,
}: {
  inspection?: InspectionPreview;
}) {
  return (
    <View className="gap-4 bg-surface p-4 pt-safe">
      <View className="rounded-2xl border border-outline bg-card p-4">
        <Text className="text-lg font-bold text-typography">Style inspector</Text>
        <Text className="mt-2 text-sm text-muted">
          {inspection
            ? `${inspection.executionPath} · ${inspection.timing.inspectorResolveMs.toFixed(3)} ms`
            : 'Select a registered view to inspect its compiled and final props.'}
        </Text>
        {inspection?.unknownRules.map((rule) => (
          <Text className="mt-1 text-sm text-red-500" key={rule}>
            Unknown: {rule}
          </Text>
        ))}
      </View>

      <View className="gap-2 rounded-2xl bg-primary p-4 motion-reduce:animate-none contrast-more:border-2 reduce-transparency:bg-surface">
        <Text className="text-white bold-text:font-bold">
          This card adapts to motion, contrast, transparency, and bold-text settings.
        </Text>
        <Text className="text-sm text-white screen-reader:font-bold font-scale-[>=1.3]:text-lg">
          Font-scale and screen-reader variants use the same environment snapshot.
        </Text>
      </View>
    </View>
  );
}
