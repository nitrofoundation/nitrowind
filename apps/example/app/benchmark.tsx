import { useBenchmark } from '../benchmark';
import { ScrollView, Text, View } from '@nitrofoundation/nitrowind';

export default function BenchmarkScreen() {
  const {
    isComplete,
    currentRun,
    totalRuns,
    average,
    min,
    max,
    itemsCount,
    renderKey,
  } = useBenchmark();

  return (
    <View className="mt-25 flex-1 px-3">
      <Text className="mb-4 text-center text-lg font-bold text-typography">
        Nitrowind Benchmark
      </Text>

      {!isComplete ? (
        <View className="mb-4 rounded-lg bg-gray p-4">
          <Text className="mb-1 text-center text-base font-semibold text-typography">
            Running benchmark...
          </Text>
          <Text className="mb-1 text-center text-base font-semibold text-typography">
            Run {currentRun + 1} of {totalRuns}
          </Text>
        </View>
      ) : (
        <View className="mb-4 rounded-lg bg-gray p-4">
          <Text className="mb-1 text-center text-base font-semibold text-typography">
            Benchmark complete
          </Text>
          <Text className="mb-1 text-center text-base font-semibold text-typography">
            Average: {average.toFixed(2)}ms
          </Text>
          <Text className="mb-1 text-center text-base font-semibold text-typography">
            Min: {min.toFixed(2)}ms
          </Text>
          <Text className="mb-1 text-center text-base font-semibold text-typography">
            Max: {max.toFixed(2)}ms
          </Text>
          <Text className="mt-2 text-center text-[14px] text-typography">
            {itemsCount * 2 + 3} views x {totalRuns} runs
          </Text>
        </View>
      )}

      <ScrollView
        key={renderKey}
        contentContainerClassName="flex-row flex-wrap gap-2"
        showsVerticalScrollIndicator={false}
      >
        {Array.from({ length: itemsCount }, (_, index) => (
          <View
            key={index}
            className="w-[30%] h-[100px] items-center justify-center rounded-2xl bg-primary"
          >
            <Text className="text-2xl font-bold text-typography">{index}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
