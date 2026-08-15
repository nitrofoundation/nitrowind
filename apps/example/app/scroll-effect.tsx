import { ScrollView, Text, View } from '@nitrofoundation/nitrowind';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ScrollEffectId } from '../navigation';

type Props = { route: { params: { effect: ScrollEffectId; title?: string } } };

function Intro({
  number,
  kicker,
  title,
  body,
}: {
  number: string;
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <View className="gap-4 px-5 pb-16 pt-8">
      <View className="self-start rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5">
        <Text className="text-xs font-black tracking-widest text-cyan-200">
          {number} · {kicker}
        </Text>
      </View>
      <Text className="text-5xl font-black leading-[52px] tracking-tight text-white">
        {title}
      </Text>
      <Text className="text-base leading-7 text-slate-300">{body}</Text>
      <Text className="text-xs font-black tracking-widest text-cyan-300">
        SCROLL TO PLAY ↓
      </Text>
    </View>
  );
}

function ScrollSpace({ className }: { className: string }) {
  // Metro's Tailwind candidate extractor only follows the standard className
  // prop. Keep content-container-only height candidates visible to it.
  if (className === '__scroll_extent_safelist__') {
    return (
      <View className="h-[2300px] h-[2400px] h-[2800px] h-[3100px] h-[3400px] h-[3500px]" />
    );
  }
  return (
    <View className={className}>
      <Text className="opacity-0">scroll space</Text>
    </View>
  );
}

function StickyHeader() {
  return (
    <ScrollView
      className="scroll-lab-source flex-1 bg-[#07111f]"
      contentContainerClassName="h-[2400px]"
    >
      <View className="h-[540px] justify-end overflow-hidden bg-linear-to-br from-indigo-900 to-cyan-700 px-5 pb-14">
        <View className="absolute -right-24 top-16 h-80 w-80 rounded-full bg-cyan-300/20" />
        <Text className="mb-3 text-sm font-black tracking-[5px] text-cyan-200">
          09 / RESPONSIVE
        </Text>
        <Text className="text-6xl font-black leading-[62px] text-white">
          A HEADER{`\n`}THAT ARRIVES.
        </Text>
        <Text className="mt-5 text-base text-white/70">
          The navigation stays hidden until the page starts moving.
        </Text>
      </View>
      <View className="sticky top-0 h-16 justify-center bg-transparent px-4">
        <View className="scroll-sticky-header h-14">
          <View className="h-full flex-row items-center justify-between rounded-full border border-white/15 bg-white px-5">
            <Text className="font-black text-slate-950">N / JOURNAL</Text>
            <Text className="font-black text-violet-700">STORIES · MENU</Text>
          </View>
        </View>
      </View>
      <View className="gap-5 px-5 pb-40 pt-12">
        {[
          'Native motion',
          'One timeline',
          'Zero listeners',
          'Built for touch',
        ].map((title, index) => (
          <View
            key={title}
            className="h-80 justify-end overflow-hidden rounded-[32px] bg-linear-to-br from-indigo-600 to-cyan-600 p-7"
          >
            <View className="absolute -right-14 -top-16 h-52 w-52 rounded-full bg-white/15" />
            <Text className="text-xs font-black tracking-widest text-white/60">
              0{index + 1}
            </Text>
            <Text className="text-4xl font-black text-white">{title}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const scenes = [
  [
    '01',
    'MIST',
    'The quiet layer',
    'scroll-parallax-1',
    'from-emerald-400 to-blue-900',
  ],
  [
    '02',
    'TIDE',
    'Movement underneath',
    'scroll-parallax-2',
    'from-cyan-500 to-indigo-950',
  ],
  [
    '03',
    'LIGHT',
    'The final reveal',
    'scroll-parallax-3',
    'from-amber-300 to-rose-800',
  ],
] as const;

function StickyParallax() {
  return (
    <ScrollView
      className="scroll-lab-source flex-1 bg-[#06151a]"
      contentContainerClassName="h-[3500px]"
      stickyHeaderIndices={[1, 3, 5]}
    >
      <Intro
        number="11"
        kicker="PARALLAX"
        title="Scenes that hold their breath."
        body="Each full-bleed scene hooks to the viewport while its artwork continues moving at another depth."
      />
      {scenes
        .map(([number, label, title, animationClass, color]) => (
          <View key={`${label}-sticky`} className="h-[560px] px-4 py-3">
            <View className={`${animationClass} h-full`}>
              <View
                className={`h-full overflow-hidden rounded-[36px] bg-linear-to-br ${color} p-7`}
              >
                <View className="scroll-parallax-orb absolute -right-24 top-12 h-80 w-80 rounded-full bg-white/20" />
                <View className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full bg-black/20" />
                <Text className="text-xs font-black tracking-widest text-white/70">
                  {number} / {label}
                </Text>
                <View className="flex-1 justify-end">
                  <Text className="text-5xl font-black text-white">
                    {title}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ))
        .flatMap((scene, index) => [
          scene,
          <ScrollSpace key={`scene-gap-${index}`} className="h-[480px]" />,
        ])}
    </ScrollView>
  );
}

const cards = [
  [
    'IDEA',
    'Start with a feeling',
    'from-fuchsia-500 to-violet-700',
    'scroll-stack-card-1',
    'scroll-depth-card-1',
  ],
  [
    'FORM',
    'Give the motion shape',
    'from-cyan-400 to-blue-700',
    'scroll-stack-card-2',
    'scroll-depth-card-2',
  ],
  [
    'SHIP',
    'Make it feel native',
    'from-amber-400 to-rose-600',
    'scroll-stack-card-3',
    'scroll-depth-card-3',
  ],
] as const;

const stickyCardClasses = [
  'sticky top-4 h-[450px]',
  'sticky top-8 h-[450px]',
  'sticky top-12 h-[450px]',
] as const;

function StackCard({
  card,
  index,
  depth,
  className,
  style,
}: {
  card: (typeof cards)[number];
  index: number;
  depth: boolean;
  className: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [label, title, color, stackClass, depthClass] = card;
  return (
    <View
      style={style}
      className={`${className} h-[450px] px-5 ${index === 0 ? 'pt-4' : index === 1 ? 'pt-8' : 'pt-12'}`}
    >
      <View
        pointerEvents="none"
        className={`${depth ? depthClass : stackClass} h-full`}
      >
        <View
          className={`h-full justify-between overflow-hidden rounded-[36px] bg-linear-to-br ${color} p-7`}
        >
          <View className="absolute -right-16 -top-12 h-60 w-60 rounded-full bg-white/15" />
          <Text className="text-sm font-black tracking-[4px] text-white/70">
            {label}
          </Text>
          <Text className="text-5xl font-black leading-[52px] text-white">
            {title}
          </Text>
        </View>
      </View>
    </View>
  );
}

function StackedCards({ depth = false }: { depth?: boolean }) {
  return (
    <ScrollView className="scroll-lab-source flex-1 bg-[#090b16]">
      <Intro
        number={depth ? '14' : '13'}
        kicker={depth ? 'NATIVE DEPTH' : 'STACK'}
        title={depth ? 'Cards fall into depth.' : 'A deck built by scrolling.'}
        body={
          depth
            ? 'CSS position: sticky pins each card while the native timeline adds scale, rotation and depth.'
            : 'Each CSS-sticky card pins independently, so the next one layers onto the deck just like the browser effect.'
        }
      />
      <StackCard
        className={stickyCardClasses[0]}
        card={cards[0]}
        index={0}
        depth={depth}
      />
      <ScrollSpace className="h-[430px]" />
      <StackCard
        className={stickyCardClasses[1]}
        card={cards[1]}
        index={1}
        depth={depth}
      />
      <ScrollSpace className="h-[430px]" />
      <StackCard
        className={stickyCardClasses[2]}
        card={cards[2]}
        index={2}
        depth={depth}
      />
      <ScrollSpace className="h-[430px]" />
      <View className="z-50 h-[2100px] items-center justify-center bg-[#090b16]">
        <Text className="text-5xl font-black text-white">
          THE DECK{`\n`}IS BUILT.
        </Text>
      </View>
    </ScrollView>
  );
}

const rail = 'NITROWIND • NATIVE MOTION • NITROWIND • NATIVE MOTION •';
const sideRail =
  'N\nI\nT\nR\nO\nW\nI\nN\nD\n•\nM\nO\nT\nI\nO\nN\n•\nN\nI\nT\nR\nO\nW\nI\nN\nD';

function MarqueeBorder() {
  return (
    <ScrollView
      className="scroll-lab-source flex-1 bg-[#19130a]"
      contentContainerClassName="h-[2800px]"
      stickyHeaderIndices={[1]}
    >
      <ScrollSpace className="h-1" />
      <View
        pointerEvents="none"
        className="h-[640px] overflow-hidden border-[10px] border-amber-300 bg-[#19130a]"
      >
        <Text
          numberOfLines={1}
          className="scroll-marquee-forward absolute left-0 top-2 w-[760px] text-lg font-black tracking-widest text-amber-300"
        >
          {rail}
        </Text>
        <Text
          numberOfLines={1}
          className="scroll-marquee-reverse absolute bottom-2 left-0 w-[760px] text-lg font-black tracking-widest text-amber-300"
        >
          {rail}
        </Text>
        <Text className="scroll-marquee-side-a absolute left-1 top-0 w-5 text-center text-xs font-black leading-5 text-amber-300">
          {sideRail}
        </Text>
        <Text className="scroll-marquee-side-b absolute right-1 top-0 w-5 text-center text-xs font-black leading-5 text-amber-300">
          {sideRail}
        </Text>
        <View className="flex-1 items-center justify-center gap-5 px-12">
          <Text className="text-center text-5xl font-black leading-[54px] text-amber-100">
            TYPE AROUND THE EDGE
          </Text>
          <Text className="text-center text-base leading-7 text-amber-100/60">
            Scroll direction drives a complete four-sided marquee.
          </Text>
        </View>
      </View>
      <View className="h-[2100px] items-center justify-center">
        <Text className="text-5xl font-black text-amber-300">
          KEEP{`\n`}SCROLLING.
        </Text>
      </View>
    </ScrollView>
  );
}

function ZoomImage({ cinematic = false }: { cinematic?: boolean }) {
  return (
    <ScrollView
      className="scroll-lab-source flex-1 bg-black"
      contentContainerClassName="h-[2800px]"
      stickyHeaderIndices={[1]}
    >
      <ScrollSpace className="h-1" />
      <View pointerEvents="none" className="h-[640px] overflow-hidden">
        {cinematic ? (
          <View className="scroll-image-blur-copy bg-photo absolute inset-0 blur" />
        ) : null}
        <View
          className={`${cinematic ? 'scroll-image-zoom-deep' : 'scroll-image-zoom'} bg-photo absolute inset-0`}
        />
        <View className="absolute inset-0 justify-end bg-black/25 p-7">
          <Text className="text-xs font-black tracking-widest text-white/70">
            {cinematic ? '25 · ZOOM + BLUR' : '26 · IMAGE ZOOM'}
          </Text>
          <Text className="text-5xl font-black text-white">Into the wild.</Text>
          <Text className="mt-3 text-base text-white/70">
            The image stays pinned while scroll changes its depth.
          </Text>
        </View>
      </View>
      <View className="h-[2100px] items-center justify-center bg-linear-to-b from-black to-slate-950">
        <Text className="text-5xl font-black text-white">
          DEPTH{`\n`}BY SCROLL.
        </Text>
      </View>
    </ScrollView>
  );
}

const slides = [
  ['MAKE', 'scroll-slider-1', 'from-pink-500 to-indigo-800'],
  ['MOVE', 'scroll-slider-2', 'from-cyan-400 to-blue-900'],
  ['MATTER', 'scroll-slider-3', 'from-amber-300 to-rose-700'],
] as const;

function Sliders() {
  return (
    <ScrollView
      className="scroll-lab-source flex-1 bg-[#090915]"
      contentContainerClassName="h-[3400px]"
    >
      <Intro
        number="28"
        kicker="SLIDERS"
        title="Stories cross paths."
        body="Full-screen image and type panels transition from alternating edges as each slide pins."
      />
      {slides
        .map(([word, animationClass, color], index) => (
          <View
            key={`${word}-sticky`}
            className="h-[580px] overflow-hidden px-4 py-3"
          >
            <View className={`${animationClass} h-full`}>
              <View
                className={`h-full justify-end overflow-hidden rounded-[36px] bg-linear-to-br ${color} p-7`}
              >
                <View className="absolute -right-20 top-16 h-72 w-72 rounded-full bg-white/20" />
                <Text className="text-xs font-black tracking-widest text-white/60">
                  0{index + 1} / EDITORIAL
                </Text>
                <Text className="text-6xl font-black text-white">{word}</Text>
              </View>
            </View>
          </View>
        ))
        .flatMap((slide, index) => [
          slide,
          <ScrollSpace key={`slide-gap-${index}`} className="h-[460px]" />,
        ])}
    </ScrollView>
  );
}

const gridAnimations = [
  'scroll-grid-1',
  'scroll-grid-2',
  'scroll-grid-3',
  'scroll-grid-4',
] as const;

function GridTile({ index }: { index: number }) {
  return (
    <View
      pointerEvents="none"
      className={`${gridAnimations[index % 4]} h-full flex-1`}
    >
      <View className="h-full justify-end overflow-hidden rounded-[28px] bg-linear-to-br from-cyan-500 to-violet-700 p-4">
        <View className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/20" />
        <Text className="text-xs font-black tracking-widest text-white/60">
          FRAME
        </Text>
        <Text className="text-3xl font-black text-white">0{index + 1}</Text>
      </View>
    </View>
  );
}

function Subgrid() {
  return (
    <ScrollView
      className="scroll-lab-source flex-1 bg-[#e8e3d7]"
      contentContainerClassName="h-[2300px]"
    >
      <View className="h-[700px] justify-end px-5 pb-16">
        <Text className="text-6xl font-black leading-[62px] text-slate-950">
          THE CRAFT{`\n`}OF UI.
        </Text>
        <Text className="mt-5 text-base text-slate-600">
          A staggered editorial grid assembles as it enters the page.
        </Text>
      </View>
      <View className="h-[1600px] gap-3 bg-[#e8e3d7] px-5 pb-[380px]">
        {[0, 2, 4, 6].map(start => (
          <View key={start} className="h-72 flex-row gap-3">
            <GridTile index={start} />
            <GridTile index={start + 1} />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Eyes() {
  return (
    <ScrollView
      className="scroll-lab-source flex-1 bg-yellow-300"
      contentContainerClassName="h-[2800px]"
      stickyHeaderIndices={[1]}
    >
      <ScrollSpace className="h-1" />
      <View
        pointerEvents="none"
        className="z-10 h-[640px] items-center justify-center overflow-hidden bg-yellow-300 px-5"
      >
        <View className="scroll-eye-bg-2 absolute inset-0 bg-fuchsia-500" />
        <View className="scroll-eye-bg-3 absolute inset-0 bg-cyan-400" />
        <Text className="mb-20 text-center text-5xl font-black leading-[56px] text-slate-950">
          WE SEE YOUR SCROLL.
        </Text>
        <View className="flex-row gap-4">
          {['scroll-eye-1', 'scroll-eye-2'].map((animationClass, eye) => (
            <View
              key={eye}
              className="h-40 w-36 items-center justify-center overflow-hidden rounded-[70px] bg-white"
            >
              <View className={`${animationClass} z-10 h-16 w-16`}>
                <View className="h-full w-full items-center justify-center rounded-full bg-black">
                  <View className="h-4 w-4 rounded-full bg-white" />
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
      <View className="h-[2200px] items-center justify-center">
        <Text className="text-5xl font-black text-slate-950">
          LOOK{`\n`}AROUND.
        </Text>
      </View>
    </ScrollView>
  );
}

function Masthead() {
  return (
    <ScrollView
      className="scroll-lab-source flex-1 bg-[#080513]"
      contentContainerClassName="h-[2800px]"
      stickyHeaderIndices={[0, 1]}
    >
      <View className="z-30 bg-[#080513] px-5 py-3">
        <View className="h-1 overflow-hidden rounded-full bg-white/10">
          <View className="scroll-mast-progress h-full">
            <View className="h-full w-full rounded-full bg-fuchsia-400" />
          </View>
        </View>
      </View>
      <View
        pointerEvents="none"
        className="h-[640px] overflow-hidden px-5 pt-20"
      >
        <View className="scroll-mast-orb absolute right-[-120px] top-28 h-[420px] w-[420px]">
          <View className="h-full w-full rounded-full bg-linear-to-br from-fuchsia-500 to-cyan-400" />
        </View>
        <View className="scroll-mast-kicker">
          <Text className="text-xs font-black tracking-[6px] text-cyan-300">
            41 / NATIVE MASTHEAD
          </Text>
        </View>
        <View className="scroll-mast-title mt-8">
          <Text className="text-7xl font-black leading-[74px] tracking-tight text-white">
            SCROLL{`\n`}INTO{`\n`}MOTION.
          </Text>
        </View>
        <Text className="mt-16 max-w-72 text-lg leading-8 text-slate-400">
          A responsive hero, progress meter and moving artwork driven by one
          native timeline.
        </Text>
      </View>
      <View className="h-[2100px] items-center justify-center bg-linear-to-b from-[#080513] to-indigo-950">
        <Text className="text-center text-5xl font-black text-white">
          ONE TIMELINE.{`\n`}A WHOLE PAGE.
        </Text>
      </View>
    </ScrollView>
  );
}

export default function ScrollEffect({ route }: Props) {
  switch (route.params.effect) {
    case 'sticky-header':
      return <StickyHeader />;
    case 'sticky-parallax':
      return <StickyParallax />;
    case 'stacked-cards':
      return <StackedCards />;
    case 'stacked-cards-depth':
      return <StackedCards depth />;
    case 'marquee-border':
      return <MarqueeBorder />;
    case 'zoom-blur':
      return <ZoomImage cinematic />;
    case 'image-zoom':
      return <ZoomImage />;
    case 'slider-transitions':
      return <Sliders />;
    case 'subgrid':
      return <Subgrid />;
    case 'eyes':
      return <Eyes />;
    case 'masthead':
      return <Masthead />;
  }
}
