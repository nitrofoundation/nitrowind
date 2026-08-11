import './global.css';

import {
  NavigationContainer,
  DefaultTheme,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { usePerformanceMonitorDevTools } from '@rozenite/performance-monitor-plugin';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NitrowindProvider } from '@nitrofoundation/nitrowind';

import AnimationsScreen from './app/animations';
import BackgroundImageScreen from './app/background-image';
import BackgroundsScreen from './app/backgrounds';
import BenchmarkScreen from './app/benchmark';
import StyleSheetBenchmarkScreen from './app/benchmark-stylesheet';
import BordersScreen from './app/borders';
import ContainersScreen from './app/containers';
import EffectsScreen from './app/effects';
import GradientsScreen from './app/gradients';
import GridScreen from './app/grid';
import HomeScreen from './app/index';
import LayoutScreen from './app/layout';
import ListsScreen from './app/lists';
import PseudoScreen from './app/pseudo';
import SvgScreen from './app/svg';
import ThemingScreen from './app/theming';
import TransformsScreen from './app/transforms';
import TypographyScreen from './app/typography';

type RootStackParamList = {
  Home: undefined;
  Animations: undefined;
  Borders: undefined;
  Backgrounds: undefined;
  Benchmark: undefined;
  StyleSheetBenchmark: undefined;
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

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['nitrowind-example://'],
  config: {
    screens: {
      Home: 'home',
      Animations: 'animations',
      Borders: 'borders',
      Backgrounds: 'backgrounds',
      Benchmark: 'benchmark',
      StyleSheetBenchmark: 'benchmark-stylesheet',
      Transforms: 'transforms',
      Containers: 'containers',
      Typography: 'typography',
      Theming: 'theming',
      Layout: 'layout',
      Pseudo: 'pseudo',
      Grid: 'grid',
      Gradients: 'gradients',
      Effects: 'effects',
      BackgroundImage: 'background-image',
      Svg: 'svg',
      Lists: 'lists',
    },
  },
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0f172a',
    card: '#6d28d9',
    text: '#ffffff',
    border: '#6d28d9',
    primary: '#ffffff',
  },
};

export default function App() {
  usePerformanceMonitorDevTools();

  return (
    <NitrowindProvider>
      <SafeAreaProvider>
        <NavigationContainer theme={navTheme} linking={linking}>
          <StatusBar barStyle="light-content" />
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
              // Native stack otherwise paints `navTheme.colors.background`
              // before the destination's adaptive `bg-surface` mounts. Since
              // that navigator color is dark, light-mode navigation briefly
              // flashes black. Keep the scene wrapper transparent so the
              // outgoing screen remains behind the transition; every screen
              // already owns an opaque, theme-aware root background.
              contentStyle: { backgroundColor: 'transparent' },
              headerStyle: { backgroundColor: '#6d28d9' },
              headerTintColor: '#ffffff',
              headerBackButtonDisplayMode: 'minimal',
              headerTitleStyle: { fontWeight: '800' },
            }}
          >
            <Stack.Screen
              name="Home"
              component={HomeScreen}
              options={{ title: 'Nitrowind' }}
            />
            <Stack.Screen
              name="Animations"
              component={AnimationsScreen}
              options={{ title: 'Animations' }}
            />
            <Stack.Screen
              name="Borders"
              component={BordersScreen}
              options={{ title: 'Borders' }}
            />
            <Stack.Screen
              name="Backgrounds"
              component={BackgroundsScreen}
              options={{ title: 'Backgrounds' }}
            />
            <Stack.Screen
              name="Benchmark"
              component={BenchmarkScreen}
              options={{ title: 'Rendering Benchmark' }}
            />
            <Stack.Screen
              name="StyleSheetBenchmark"
              component={StyleSheetBenchmarkScreen}
              options={{ title: 'StyleSheet Benchmark' }}
            />
            <Stack.Screen
              name="Transforms"
              component={TransformsScreen}
              options={{ title: 'Transforms & Shadows' }}
            />
            <Stack.Screen
              name="Containers"
              component={ContainersScreen}
              options={{ title: 'Container Queries' }}
            />
            <Stack.Screen
              name="Typography"
              component={TypographyScreen}
              options={{ title: 'Typography' }}
            />
            <Stack.Screen
              name="Theming"
              component={ThemingScreen}
              options={{ title: 'Theming' }}
            />
            <Stack.Screen
              name="Layout"
              component={LayoutScreen}
              options={{ title: 'Layout & Platform' }}
            />
            <Stack.Screen
              name="Pseudo"
              component={PseudoScreen}
              options={{ title: 'Pseudo Selectors' }}
            />
            <Stack.Screen
              name="Grid"
              component={GridScreen}
              options={{ title: 'Grid' }}
            />
            <Stack.Screen
              name="Gradients"
              component={GradientsScreen}
              options={{ title: 'Gradients' }}
            />
            <Stack.Screen
              name="Effects"
              component={EffectsScreen}
              options={{ title: 'Effects' }}
            />
            <Stack.Screen
              name="BackgroundImage"
              component={BackgroundImageScreen}
              options={{ title: 'Background Image' }}
            />
            <Stack.Screen
              name="Svg"
              component={SvgScreen}
              options={{ title: 'SVG' }}
            />
            <Stack.Screen
              name="Lists"
              component={ListsScreen}
              options={{ title: 'Virtual Lists' }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </NitrowindProvider>
  );
}
