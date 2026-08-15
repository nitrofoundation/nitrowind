import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FlatList, Pressable, Text, View } from '@nitrofoundation/nitrowind';
import type { RootStackParamList, ScrollEffectId } from '../navigation';

export type { ScrollEffectId } from '../navigation';

const EFFECTS: Array<{
  id?: ScrollEffectId;
  number: string;
  title: string;
  subtitle: string;
  color: string;
}> = [
  {
    number: '00',
    title: 'Timeline basics',
    subtitle: 'The original opacity, translate, scale and rotation demo',
    color: 'from-cyan-400 to-blue-600',
  },
  {
    id: 'sticky-header',
    number: '09',
    title: 'Responsive sticky header',
    subtitle: 'A compact navigation bar that pins while content moves',
    color: 'from-violet-500 to-fuchsia-600',
  },
  {
    id: 'sticky-parallax',
    number: '11',
    title: 'Sticky parallax sections',
    subtitle: 'Layered scenes hook into place at different depths',
    color: 'from-emerald-400 to-cyan-600',
  },
  {
    id: 'stacked-cards',
    number: '13',
    title: 'Stacked cards',
    subtitle: 'Native sticky cards compress into a tactile deck',
    color: 'from-orange-400 to-rose-600',
  },
  {
    id: 'stacked-cards-depth',
    number: '14',
    title: 'Stacked cards · depth',
    subtitle: 'The GSAP idea rebuilt with native CSS transforms',
    color: 'from-indigo-400 to-violet-700',
  },
  {
    id: 'marquee-border',
    number: '24',
    title: 'Marquee page border',
    subtitle: 'Opposing type rails move as the page scrolls',
    color: 'from-amber-300 to-orange-600',
  },
  {
    id: 'zoom-blur',
    number: '25',
    title: 'Zoom + blur image',
    subtitle: 'A cinematic image recedes into atmospheric haze',
    color: 'from-sky-400 to-indigo-700',
  },
  {
    id: 'image-zoom',
    number: '26',
    title: 'Image zoom',
    subtitle: 'The ScrollTrigger concept without a JS scroll listener',
    color: 'from-lime-400 to-emerald-700',
  },
  {
    id: 'slider-transitions',
    number: '28',
    title: 'Slider transitions',
    subtitle: 'Editorial panels cross the viewport in sequence',
    color: 'from-pink-400 to-rose-700',
  },
  {
    id: 'subgrid',
    number: '29',
    title: 'Scroll animation grid',
    subtitle: 'A staggered image mosaic assembles while scrolling',
    color: 'from-cyan-300 to-violet-700',
  },
  {
    id: 'eyes',
    number: '35',
    title: 'Eye scroll',
    subtitle: 'A pair of playful pupils follows timeline progress',
    color: 'from-yellow-300 to-amber-600',
  },
  {
    id: 'masthead',
    number: '41',
    title: 'Masthead webpage',
    subtitle: 'Type, progress and artwork compose into one hero',
    color: 'from-fuchsia-500 to-cyan-500',
  },
];

export default function ScrollAnimations() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <FlatList
      data={EFFECTS}
      keyExtractor={item => item.number}
      className="flex-1 bg-[#07111f]"
      contentContainerClassName="gap-3 px-safe-or-5 pb-safe-offset-12 pt-5"
      ListHeaderComponent={
        <View className="gap-3 pb-4">
          <Text className="text-4xl font-black tracking-tight text-white">
            Native scroll lab
          </Text>
          <Text className="text-base leading-7 text-slate-300">
            Eleven iOS-first experiments driven by CSS timelines and native
            scrolling. No JavaScript onScroll handlers.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          className="overflow-hidden rounded-[24px] border border-white/10 bg-white/5"
          onPress={() =>
            item.id
              ? navigation.push('ScrollEffect', {
                  effect: item.id,
                  title: item.title,
                })
              : navigation.push('ScrollTimelineBasics')
          }
        >
          <View className="flex-row items-center gap-4 p-4">
            <View
              className={`h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br ${item.color}`}
            >
              <Text className="text-base font-black text-white">
                {item.number}
              </Text>
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-base font-extrabold text-white">
                {item.title}
              </Text>
              <Text className="text-sm leading-5 text-slate-400">
                {item.subtitle}
              </Text>
            </View>
            <Text className="text-3xl text-slate-500">›</Text>
          </View>
        </Pressable>
      )}
    />
  );
}
