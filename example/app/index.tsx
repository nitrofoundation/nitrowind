/**
 * Home screen — a `FlatList` of every demo page.
 *
 * Each row navigates to its route with Expo Router. The list itself is a
 * nitrowind `FlatList`, so both the scroll host and its content container are
 * styled with class names (`className` / `contentContainerClassName`).
 */
import { useRouter, type Href } from "expo-router";
import { FlatList, Pressable, Text, View } from "nitrowind";

import { ThemeToggle } from "../components/ui";

type Page = {
  route: Href;
  title: string;
  subtitle: string;
  icon: string;
  tile: string;
};

const PAGES: Page[] = [
  {
    route: "/animations",
    title: "Animations",
    subtitle: "Entering, exiting, layout & CSS keyframes",
    icon: "\u2728",
    tile: "bg-violet-500",
  },
  {
    route: "/borders",
    title: "Borders",
    subtitle: "Widths, colors, radius & styles",
    icon: "\u25A2",
    tile: "bg-rose-500",
  },
  {
    route: "/backgrounds",
    title: "Backgrounds",
    subtitle: "Colors, opacity & theme surfaces",
    icon: "\uD83C\uDFA8",
    tile: "bg-sky-500",
  },
  {
    route: "/transforms",
    title: "Transforms & Shadows",
    subtitle: "Rotate, scale, translate, skew & shadow",
    icon: "\uD83C\uDF00",
    tile: "bg-amber-500",
  },
  {
    route: "/containers",
    title: "Container Queries",
    subtitle: "Native size-aware styling \u2014 no re-render",
    icon: "\uD83D\uDCD0",
    tile: "bg-emerald-500",
  },
  {
    route: "/typography",
    title: "Typography",
    subtitle: "Sizes, weights, tracking & leading",
    icon: "\uD83D\uDD24",
    tile: "bg-fuchsia-500",
  },
  {
    route: "/theming",
    title: "Theming",
    subtitle: "Live dark / light token swap",
    icon: "\uD83C\uDF17",
    tile: "bg-indigo-500",
  },
  {
    route: "/layout",
    title: "Layout & Platform",
    subtitle: "Flex, gap, safe-area, ios / android",
    icon: "\uD83E\uDDF1",
    tile: "bg-teal-500",
  },
  {
    route: "/pseudo",
    title: "Pseudo Selectors",
    subtitle: "Native states, placeholder, and DOM selector limits",
    icon: "*",
    tile: "bg-lime-500",
  },
  {
    route: "/grid",
    title: "Grid",
    subtitle: "RN gap support and Nitrowind grid engine status",
    icon: "#",
    tile: "bg-cyan-500",
  },
  {
    route: "/profiling",
    title: "Profiling",
    subtitle: "1000 Nitrowind list items with render timing output",
    icon: "ms",
    tile: "bg-orange-500",
  },
];

function ListHeader() {
  return (
    <View className="gap-4 pb-2">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-3xl font-extrabold text-on-surface">
            Nitrowind
          </Text>
          <Text className="mt-1 text-sm text-muted">
            Native Tailwind for React Native. Tap a page to explore a feature.
          </Text>
        </View>
        <ThemeToggle />
      </View>
    </View>
  );
}

export default function Home() {
  const router = useRouter();

  return (
    <FlatList
      data={PAGES}
      keyExtractor={(item) => String(item.route)}
      className="flex-1 bg-surface"
      contentContainerClassName="gap-3 px-safe-or-5 pb-safe-offset-10 pt-5"
      ListHeaderComponent={<ListHeader />}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <Pressable
          className="flex-row self-stretch items-center gap-4 rounded-2xl border border-border bg-surface-elevated p-4"
          accessibilityRole="button"
          onPress={() => router.push(item.route)}
        >
          {/* `entering-fade-in-up` plays as each row mounts (needs Reanimated). */}
          <View
            className={`h-12 w-12 items-center justify-center rounded-xl entering-fade-in-up entering-duration-300 ${item.tile}`}
          >
            <Text className="text-xl">{item.icon}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-on-surface">
              {item.title}
            </Text>
            <Text className="text-sm text-muted">{item.subtitle}</Text>
          </View>
          <Text className="text-2xl text-muted">{"\u203A"}</Text>
        </Pressable>
      )}
    />
  );
}
