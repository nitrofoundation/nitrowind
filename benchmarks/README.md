# Nitrowind Rendering Benchmark

This benchmark mirrors the workload in [uni-stack/uniwind-benchmarks](https://github.com/uni-stack/uniwind-benchmarks): 1,000 Tailwind-styled cards, each containing a text node, are re-rendered 10 times with a 100ms pause between measurements.

Each measurement starts immediately before the state update that changes the scroll view key. It ends in `requestIdleCallback`, after the subsequent layout has had a chance to settle. This is the same measurement flow used by Uniwind's benchmark: the screen reports the average, minimum, and maximum for its ten runs.

## Run it

1. Start the example app on the device you want to measure.
2. Open **Rendering Benchmark** from the home screen.
3. Wait for all 10 runs to complete. The screen shows the average, minimum, and maximum.

For meaningful comparisons, use the same React Native version, release mode, device, OS version, and app launch state for every library. The Uniwind repository reports second-launch release measurements from an iPhone 17 Pro on iOS 26.0; results from a simulator or another device should be reported separately.
