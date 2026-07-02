import './global.css';

import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { usePerformanceMonitorDevTools } from '@rozenite/performance-monitor-plugin';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NitrowindProvider } from 'nitrowind';

import AnimationsScreen from './app/animations';
import BackgroundsScreen from './app/backgrounds';
import BordersScreen from './app/borders';
import ContainersScreen from './app/containers';
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
  Transforms: undefined;
  Containers: undefined;
  Typography: undefined;
  Theming: undefined;
  Layout: undefined;
  Pseudo: undefined;
  Grid: undefined;
  Gradients: undefined;
  Svg: undefined;
  Lists: undefined;
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
        <NavigationContainer theme={navTheme}>
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
