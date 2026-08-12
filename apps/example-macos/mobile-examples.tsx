import type {ComponentType} from 'react';

import BackgroundImage from '../example/app/background-image';
import Backgrounds from '../example/app/backgrounds';
import BenchmarkStyleSheet from '../example/app/benchmark-stylesheet';
import Benchmark from '../example/app/benchmark';
import Borders from '../example/app/borders';
import Containers from '../example/app/containers';
import Effects from '../example/app/effects';
import Gradients from '../example/app/gradients';
import Grid from '../example/app/grid';
import Layout from '../example/app/layout';
import Lists from '../example/app/lists';
import Pseudo from '../example/app/pseudo';
import Svg from '../example/app/svg';
import Theming from '../example/app/theming';
import Transforms from '../example/app/transforms';
import Typography from '../example/app/typography';
import Animations from '../example/app/animations';

export type MobileExampleId =
  | 'mobile-benchmark'
  | 'mobile-benchmark-stylesheet'
  | 'mobile-animations'
  | 'mobile-borders'
  | 'mobile-backgrounds'
  | 'mobile-transforms'
  | 'mobile-containers'
  | 'mobile-typography'
  | 'mobile-theming'
  | 'mobile-layout'
  | 'mobile-pseudo'
  | 'mobile-grid'
  | 'mobile-gradients'
  | 'mobile-effects'
  | 'mobile-background-image'
  | 'mobile-svg'
  | 'mobile-lists';

export const MOBILE_EXAMPLES: ReadonlyArray<{
  id: MobileExampleId;
  symbol: string;
  title: string;
  description: string;
}> = [
  {id: 'mobile-benchmark', symbol: '◷', title: 'Benchmark v2', description: 'The same NitroWind benchmark workload used by the mobile example.'},
  {id: 'mobile-benchmark-stylesheet', symbol: '◫', title: 'StyleSheet Control', description: 'The identical benchmark tree rendered with React Native StyleSheet.'},
  {id: 'mobile-animations', symbol: '▶', title: 'Animations', description: 'Entering, exiting, layout, transitions, and CSS keyframe examples.'},
  {id: 'mobile-borders', symbol: '▢', title: 'Borders', description: 'Widths, colors, radii, styles, and per-side borders.'},
  {id: 'mobile-backgrounds', symbol: '◩', title: 'Backgrounds', description: 'Colors, opacity, and theme-aware surfaces.'},
  {id: 'mobile-transforms', symbol: '⌁', title: 'Transforms & Shadows', description: 'Rotate, scale, translate, skew, and native shadows.'},
  {id: 'mobile-containers', symbol: '▣', title: 'Container Queries', description: 'Native size-aware styling without React rerenders.'},
  {id: 'mobile-typography', symbol: 'T', title: 'Typography', description: 'Sizes, weights, tracking, leading, and decoration.'},
  {id: 'mobile-theming', symbol: '◐', title: 'Theming', description: 'Live light, dark, and named-theme token swaps.'},
  {id: 'mobile-layout', symbol: '⊞', title: 'Layout & Platform', description: 'Flex, gap, safe area, responsive, and platform variants.'},
  {id: 'mobile-pseudo', symbol: '⌘', title: 'Pseudo Selectors', description: 'Native state, group, placeholder, and selector examples.'},
  {id: 'mobile-grid', symbol: '#', title: 'Grid', description: 'The full native grid feature and support matrix.'},
  {id: 'mobile-gradients', symbol: '◒', title: 'Gradients', description: 'Native linear, radial, conic, and gradient-border examples.'},
  {id: 'mobile-effects', symbol: '✦', title: 'Effects', description: 'Clip paths, filters, shadows, background images, and rich text.'},
  {id: 'mobile-background-image', symbol: '▧', title: 'Background Image', description: 'Native raster sizing, positioning, and repeat modes.'},
  {id: 'mobile-svg', symbol: '◇', title: 'SVG', description: 'ClassName-styled react-native-svg primitives.'},
  {id: 'mobile-lists', symbol: '☷', title: 'Virtual Lists', description: 'Styled vertical and horizontal virtualized-list surfaces.'},
];

const SCREENS: Record<MobileExampleId, ComponentType> = {
  'mobile-benchmark': Benchmark,
  'mobile-benchmark-stylesheet': BenchmarkStyleSheet,
  'mobile-animations': Animations,
  'mobile-borders': Borders,
  'mobile-backgrounds': Backgrounds,
  'mobile-transforms': Transforms,
  'mobile-containers': Containers,
  'mobile-typography': Typography,
  'mobile-theming': Theming,
  'mobile-layout': Layout,
  'mobile-pseudo': Pseudo,
  'mobile-grid': Grid,
  'mobile-gradients': Gradients,
  'mobile-effects': Effects,
  'mobile-background-image': BackgroundImage,
  'mobile-svg': Svg,
  'mobile-lists': Lists,
};

export function MobileExample({id}: {id: MobileExampleId}) {
  const Screen = SCREENS[id];
  return <Screen />;
}
