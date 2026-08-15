import type { LinkingOptions } from '@react-navigation/native';

export type ScrollEffectId =
  | 'sticky-header'
  | 'sticky-parallax'
  | 'stacked-cards'
  | 'stacked-cards-depth'
  | 'marquee-border'
  | 'zoom-blur'
  | 'image-zoom'
  | 'slider-transitions'
  | 'subgrid'
  | 'eyes'
  | 'masthead';

export type RootStackParamList = {
  Home: undefined;
  Animations: undefined;
  AppleGradient: undefined;
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
  ScrollAnimations: undefined;
  ScrollTimelineBasics: undefined;
  ScrollEffect: { effect: ScrollEffectId; title?: string };
  Grid: undefined;
  Gradients: undefined;
  Effects: undefined;
  BackgroundImage: undefined;
  Svg: undefined;
  Lists: undefined;
  Masking: undefined;
};

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [],
  config: {
    initialRouteName: 'Home',
    screens: {
      Home: '',
      Animations: 'animations',
      AppleGradient: 'apple-gradient',
      Borders: 'borders',
      Backgrounds: 'backgrounds',
      Benchmark: 'benchmark',
      StyleSheetBenchmark: 'stylesheet-benchmark',
      Transforms: 'transforms',
      Containers: 'container-queries',
      Typography: 'typography',
      Theming: 'theming',
      Layout: 'layout',
      Pseudo: 'pseudo-selectors',
      ScrollAnimations: 'scroll-animations',
      ScrollTimelineBasics: 'scroll-animations/timeline-basics',
      ScrollEffect: 'scroll-animations/:effect',
      Grid: 'grid',
      Gradients: 'gradients',
      Effects: 'effects',
      BackgroundImage: 'background-image',
      Svg: 'svg',
      Lists: 'lists',
      Masking: 'masking',
    },
  },
};

const SCROLL_EFFECT_TITLES: Record<ScrollEffectId, string> = {
  'sticky-header': 'Responsive sticky header',
  'sticky-parallax': 'Sticky parallax sections',
  'stacked-cards': 'Stacked cards',
  'stacked-cards-depth': 'Stacked cards · depth',
  'marquee-border': 'Marquee page border',
  'zoom-blur': 'Zoom + blur image',
  'image-zoom': 'Image zoom',
  'slider-transitions': 'Slider transitions',
  subgrid: 'Scroll animation grid',
  eyes: 'Eye scroll',
  masthead: 'Masthead webpage',
};

export function scrollEffectTitle(effect: ScrollEffectId): string {
  return SCROLL_EFFECT_TITLES[effect];
}
