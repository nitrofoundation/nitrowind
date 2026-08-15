import './global.css';

import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NitrowindProvider } from '@nitrofoundation/nitrowind';

import AnimationsScreen from './app/animations';
import AppleGradientScreen from './app/apple-gradient';
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
import MaskingScreen from './app/masking';
import PseudoScreen from './app/pseudo';
import ScrollAnimationsScreen from './app/scroll-animations';
import ScrollEffectScreen from './app/scroll-effect';
import ScrollTimelineBasicsScreen from './app/scroll-timeline-basics';
import SvgScreen from './app/svg';
import ThemingScreen from './app/theming';
import TransformsScreen from './app/transforms';
import TypographyScreen from './app/typography';
import { usePerformanceMonitorDevTools } from './devtools/usePerformanceMonitorDevTools';
import {
  linking,
  scrollEffectTitle,
  type RootStackParamList,
} from './navigation';

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
        <NavigationContainer
          linking={Platform.OS === 'web' ? linking : undefined}
          theme={navTheme}
        >
          <StatusBar barStyle="light-content" />
          <Stack.Navigator
            initialRouteName="Home"
            screenOptions={{
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
              name="ScrollAnimations"
              component={ScrollAnimationsScreen}
              options={{ title: 'Scroll-driven Animations' }}
            />
            <Stack.Screen
              name="ScrollTimelineBasics"
              component={ScrollTimelineBasicsScreen}
              options={{ title: 'Timeline Basics' }}
            />
            <Stack.Screen
              name="ScrollEffect"
              component={ScrollEffectScreen}
              options={({ route }) => ({
                title:
                  route.params.title ?? scrollEffectTitle(route.params.effect),
              })}
            />
            <Stack.Screen
              name="AppleGradient"
              component={AppleGradientScreen}
              options={{ headerShown: false, animation: 'fade' }}
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
              name="Masking"
              component={MaskingScreen}
              options={{ title: 'Masking' }}
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
