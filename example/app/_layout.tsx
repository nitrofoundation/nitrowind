/**
 * Root layout for the Expo Router app.
 *
 * - Imports `global.css` once: the nitrowind Metro transformer compiles the
 *   Tailwind classes used across `app/` and `components/` and this import
 *   registers the resulting native style map with the runtime.
 * - Wraps every route in `NitrowindProvider` so the C++ engine is installed and
 *   runtime state (theme, color scheme, insets, dimensions) is available.
 * - Declares the navigation `Stack`; titles map 1:1 to the files in `app/`.
 */
import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NitrowindProvider } from "nitrowind";

export default function RootLayout() {
  console.log("layout render");

  return (
    <NitrowindProvider>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#6d28d9" },
            headerTintColor: "#ffffff",
            headerLargeTitleEnabled: false,
            headerBackButtonDisplayMode: "minimal",
            headerBackButtonMenuEnabled: false,
            headerTitleStyle: { fontWeight: "800" },
            freezeOnBlur: false,
          }}
        >
          <Stack.Screen name="index" options={{ title: "Nitrowind" }} />
          <Stack.Screen name="animations" options={{ title: "Animations" }} />
          <Stack.Screen name="borders" options={{ title: "Borders" }} />
          <Stack.Screen name="backgrounds" options={{ title: "Backgrounds" }} />
          <Stack.Screen
            name="transforms"
            options={{ title: "Transforms & Shadows" }}
          />
          <Stack.Screen
            name="containers"
            options={{ title: "Container Queries" }}
          />
          <Stack.Screen name="typography" options={{ title: "Typography" }} />
          <Stack.Screen name="theming" options={{ title: "Theming" }} />
          <Stack.Screen
            name="layout"
            options={{ title: "Layout & Platform" }}
          />
          <Stack.Screen name="pseudo" options={{ title: "Pseudo Selectors" }} />
          <Stack.Screen name="grid" options={{ title: "Grid" }} />
          <Stack.Screen name="lists" options={{ title: "Nitrolist" }} />
          <Stack.Screen name="profiling" options={{ title: "Profiling" }} />
        </Stack>
      </SafeAreaProvider>
    </NitrowindProvider>
  );
}
