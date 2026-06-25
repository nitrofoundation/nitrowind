import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: "Nitrowind Example",
    slug: "nitrowind-example",
    version: "0.1.0",
    scheme: "nitrowind",
    orientation: "default",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.anonymous.nitrowind-example",
    },
    plugins: ["expo-router", "expo-status-bar"],
    extra: {
      router: {
        adaptiveColors: false,
      },
    },
    experiments: {
      typedRoutes: false,
    },
  };
};
