/**
 * Home screen — a `FlatList` of every demo page.
 *
 * Each row navigates to its route with React Navigation. The list itself is a
 * nitrowind `FlatList`, so both the scroll host and its content container are
 * styled with class names (`className` / `contentContainerClassName`).
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, Pressable, Text, View } from '@nitrofoundation/nitrowind';
import { ThemeToggle } from '../components/ui';

type RootStackParamList = {
  Home: undefined;
  Animations: undefined;
  Benchmark: undefined;
  StyleSheetBenchmark: undefined;
  Borders: undefined;
  Backgrounds: undefined;
  Transforms: undefined;
  Containers: undefined;
  Typography: undefined;
  Theming: undefined;
  Layout: undefined;
  Pseudo: undefined;
  Grid: undefined;
  Gradients: undefined;
  Effects: undefined;
  BackgroundImage: undefined;
  Svg: undefined;
  Lists: undefined;
};

type Page = {
  route: keyof RootStackParamList;
  title: string;
  subtitle: string;
  icon: string;
  tile: string;
};

const PAGES: Page[] = [
  {
    route: 'Benchmark',
    title: 'Benchmark v2',
    subtitle: 'Grid remount + native theme-switch measurements',
    icon: '#',
    tile: 'bg-slate-700',
  },
  {
    route: 'StyleSheetBenchmark',
    title: 'StyleSheet Control',
    subtitle: 'The exact same v2 workload using StyleSheet',
    icon: '=',
    tile: 'bg-emerald-700',
  },
  {
    route: 'Animations',
    title: 'Animations',
    subtitle: 'Entering, exiting, layout & CSS keyframes',
    icon: '\u2728',
    tile: 'bg-violet-500',
  },
  {
    route: 'Borders',
    title: 'Borders',
    subtitle: 'Widths, colors, radius & styles',
    icon: '\u25A2',
    tile: 'bg-rose-500',
  },
  {
    route: 'Backgrounds',
    title: 'Backgrounds',
    subtitle: 'Colors, opacity & theme surfaces',
    icon: '\uD83C\uDFA8',
    tile: 'bg-sky-500',
  },
  {
    route: 'Transforms',
    title: 'Transforms & Shadows',
    subtitle: 'Rotate, scale, translate, skew & shadow',
    icon: '\uD83C\uDF00',
    tile: 'bg-amber-500',
  },
  {
    route: 'Containers',
    title: 'Container Queries',
    subtitle: 'Native size-aware styling \u2014 no re-render',
    icon: '\uD83D\uDCD0',
    tile: 'bg-emerald-500',
  },
  {
    route: 'Typography',
    title: 'Typography',
    subtitle: 'Sizes, weights, tracking & leading',
    icon: '\uD83D\uDD24',
    tile: 'bg-fuchsia-500',
  },
  {
    route: 'Theming',
    title: 'Theming',
    subtitle: 'Live dark / light token swap',
    icon: '\uD83C\uDF17',
    tile: 'bg-indigo-500',
  },
  {
    route: 'Layout',
    title: 'Layout & Platform',
    subtitle: 'Flex, gap, safe-area, ios / android',
    icon: '\uD83E\uDDF1',
    tile: 'bg-teal-500',
  },
  {
    route: 'Pseudo',
    title: 'Pseudo Selectors',
    subtitle: 'Native states, placeholder, and DOM selector limits',
    icon: '*',
    tile: 'bg-lime-500',
  },
  {
    route: 'Grid',
    title: 'Grid',
    subtitle: 'RN gap support and Nitrowind grid engine status',
    icon: '#',
    tile: 'bg-cyan-500',
  },
  {
    route: 'Gradients',
    title: 'Gradients',
    subtitle: 'Native linear, radial & animated gradients',
    icon: '🌈',
    tile: 'bg-linear-to-br from-fuchsia-500 to-cyan-400',
  },
  {
    route: 'Effects',
    title: 'Effects',
    subtitle: 'Animated gradient angle, clip-path, background-image, text-shadow',
    icon: '✨',
    tile: 'bg-linear-45 from-fuchsia-500 to-cyan-400',
  },
  {
    route: 'BackgroundImage',
    title: 'Background Image',
    subtitle: 'url(...) rasters — size, position & repeat, painted natively',
    icon: '🖼️',
    tile: 'bg-tile',
  },
  {
    route: 'Svg',
    title: 'SVG',
    subtitle: 'className-styled react-native-svg (fill-*, stroke-*)',
    icon: '✎',
    tile: 'bg-orange-500',
  },
  {
    route: 'Lists',
    title: 'List Features',
    subtitle: 'Styled vertical and horizontal list surfaces',
    icon: '[]',
    tile: 'bg-blue-500',
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
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <FlatList
      data={PAGES}
      keyExtractor={item => String(item.route)}
      className="flex-1 bg-surface"
      contentContainerClassName="gap-3 px-safe-or-5 pb-safe-offset-10 pt-5"
      ListHeaderComponent={<ListHeader />}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <Pressable
          className="flex-row self-stretch items-center gap-4 rounded-2xl border border-border bg-surface-elevated p-4"
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.title}`}
          testID={`home-route-${String(item.route).toLowerCase()}`}
          onPress={() => navigation.push(item.route)}
        >
          <View
            className={`h-12 w-12 items-center justify-center rounded-xl ${item.tile}`}
          >
            <Text className="text-xl">{item.icon}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-on-surface">
              {item.title}
            </Text>
            <Text className="text-sm text-muted">{item.subtitle}</Text>
          </View>
          <Text className="text-2xl text-muted">{'\u203A'}</Text>
        </Pressable>
      )}
    />
  );
}
