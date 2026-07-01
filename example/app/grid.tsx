import { Text, View } from 'nitrowind';

import { Card, Caption, Screen, Section } from '../components/ui';

type SupportSource = 'rn' | 'nitrowind' | 'bridge' | 'unsupported';

const RN_LAYOUT_SUPPORT = [
  { name: 'flex-wrap', status: 'RN native', source: 'rn' },
  { name: 'gap', status: 'RN native', source: 'rn' },
  { name: 'row-gap', status: 'RN native', source: 'rn' },
  { name: 'column-gap', status: 'RN native', source: 'rn' },
] satisfies Array<{ name: string; status: string; source: SupportSource }>;

const NITROWIND_GRID_SUPPORT = [
  { name: 'equal fr columns', status: 'internal', source: 'nitrowind' },
  { name: 'fixed px columns', status: 'internal', source: 'nitrowind' },
  {
    name: 'grid-template-columns',
    status: 'internal',
    source: 'nitrowind',
  },
  { name: 'grid-template-rows', status: 'internal', source: 'nitrowind' },
  { name: 'grid-template shorthand', status: 'internal', source: 'nitrowind' },
  { name: 'auto rows', status: 'internal', source: 'nitrowind' },
  { name: 'row + column gaps', status: 'internal', source: 'nitrowind' },
  { name: 'col-start / row-start', status: 'internal', source: 'nitrowind' },
  { name: 'col-span / row-span', status: 'internal', source: 'nitrowind' },
  { name: 'sparse auto placement', status: 'internal', source: 'nitrowind' },
] satisfies Array<{ name: string; status: string; source: SupportSource }>;

const GRID_BRIDGE_WORK = [
  { name: 'NitrowindGridView', status: 'bridge next', source: 'bridge' },
  { name: 'Fabric ShadowNode layout', status: 'bridge next', source: 'bridge' },
  {
    name: 'JS class metadata to native props',
    status: 'bridge next',
    source: 'bridge',
  },
  {
    name: 'iOS / Android component registration',
    status: 'bridge next',
    source: 'bridge',
  },
] satisfies Array<{ name: string; status: string; source: SupportSource }>;

const NOT_SUPPORTED_YET = [
  { name: 'display: grid', status: 'not RN', source: 'unsupported' },
  { name: 'grid-column / grid-row', status: 'not RN', source: 'unsupported' },
  { name: 'dense auto-placement', status: 'later', source: 'unsupported' },
  { name: 'subgrid / masonry', status: 'later', source: 'unsupported' },
  { name: 'named grid lines', status: 'later', source: 'unsupported' },
  { name: 'min-content / max-content', status: 'later', source: 'unsupported' },
] satisfies Array<{ name: string; status: string; source: SupportSource }>;

const INTERNAL_GRID_PREVIEW = [
  { label: 'A', className: 'col-span-1 bg-sky-500' },
  { label: 'B', className: 'col-span-1 bg-emerald-500' },
  { label: 'C', className: 'col-span-1 bg-fuchsia-500' },
  { label: 'Span', className: 'col-span-2 bg-amber-500' },
  { label: 'D', className: 'col-span-1 bg-rose-500' },
];

const AUTO_TRACK_EXAMPLES = [
  {
    title: 'auto-rows-[64px]',
    className: 'grid grid-cols-3 auto-rows-[64px] flex-row flex-wrap gap-3',
    cells: ['64', '64', '64'],
  },
  {
    title: 'auto-rows-[minmax(48px,96px)]',
    className:
      'grid grid-cols-3 auto-rows-[minmax(48px,96px)] flex-row flex-wrap gap-3',
    cells: ['min', 'max', 'track'],
  },
  {
    title: 'auto-cols-[72px]',
    className:
      'grid auto-cols-[72px] auto-rows-[48px] flex-row flex-wrap gap-3',
    cells: ['72', '72', '72'],
  },
  {
    title: 'auto-cols-[minmax(56px,104px)]',
    className:
      'grid auto-cols-[minmax(56px,104px)] auto-rows-[48px] flex-row flex-wrap gap-3',
    cells: ['min', 'max', 'col'],
  },
  {
    title: 'auto-rows-min',
    className: 'grid grid-cols-3 auto-rows-min flex-row flex-wrap gap-3',
    cells: ['short', 'two\nlines', 'min'],
  },
  {
    title: 'auto-rows-max',
    className: 'grid grid-cols-3 auto-rows-max flex-row flex-wrap gap-3',
    cells: ['short', 'tall\ncontent\ncell', 'max'],
  },
] satisfies Array<{ title: string; className: string; cells: string[] }>;

const AUTO_TRACK_COLORS = ['bg-sky-500', 'bg-emerald-500', 'bg-fuchsia-500'];

const TEMPLATE_TRACK_EXAMPLES = [
  {
    title: 'grid-cols-[96px_1fr_2fr]',
    className:
      'grid grid-cols-[96px_1fr_2fr] grid-rows-[48px_72px] flex-row flex-wrap gap-3',
    cells: [
      { label: '96', className: 'bg-sky-500' },
      { label: '1fr', className: 'bg-emerald-500' },
      { label: '2fr', className: 'bg-fuchsia-500' },
      { label: 'row', className: 'bg-amber-500' },
      { label: '72', className: 'col-span-2 bg-rose-500' },
    ],
  },
  {
    title: 'grid-cols-[repeat(3,minmax(0,1fr))]',
    className:
      'grid grid-cols-[repeat(3,minmax(0,1fr))] grid-rows-[56px] flex-row flex-wrap gap-3',
    cells: [
      { label: 'A', className: 'bg-primary' },
      { label: 'B', className: 'bg-accent' },
      { label: 'C', className: 'bg-success' },
    ],
  },
] satisfies Array<{
  title: string;
  className: string;
  cells: Array<{ label: string; className: string }>;
}>;

const PAGE_TEMPLATE_CLASS =
  'grid relative h-[400px] grid-template-["header_header"_60px_"navigation_main"_280px_"navigation_footer"_60px_/_160px_1fr]';

const PAGE_TEMPLATE_CELLS = [
  {
    label: 'Header',
    className: 'grid-area-[header] bg-[#00ff00]',
  },
  {
    label: 'Navigation',
    className: 'grid-area-[navigation] bg-[#add8e6]',
  },
  {
    label: 'Main area',
    className: 'grid-area-[main] bg-[#ffff00]',
  },
  {
    label: 'Footer',
    className: 'grid-area-[footer] bg-[#ff0000]',
  },
] satisfies Array<{ label: string; className: string }>;

const CELLS = [
  { label: 'A', className: 'w-[48%] bg-sky-500' },
  { label: 'B', className: 'w-[48%] bg-emerald-500' },
  { label: 'Span', className: 'w-full bg-amber-500' },
  { label: 'C', className: 'w-[48%] bg-fuchsia-500' },
  { label: 'D', className: 'w-[48%] bg-rose-500' },
];

function badgeClass(source: SupportSource): string {
  switch (source) {
    case 'rn':
      return 'bg-emerald-500';
    case 'nitrowind':
      return 'bg-sky-500';
    case 'bridge':
      return 'bg-amber-500';
    default:
      return 'bg-surface';
  }
}

function badgeTextClass(source: SupportSource): string {
  return source === 'unsupported' ? 'text-muted' : 'text-white';
}

function PropertyRow({
  name,
  status,
  source,
}: {
  name: string;
  status: string;
  source: SupportSource;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <Text className="flex-1 text-sm font-semibold text-on-surface">
        {name}
      </Text>
      <View className={`rounded-full px-3 py-1 ${badgeClass(source)}`}>
        <Text className={`text-xs font-bold ${badgeTextClass(source)}`}>
          {status}
        </Text>
      </View>
    </View>
  );
}

function AutoTrackExample({
  title,
  className,
  cells,
}: {
  title: string;
  className: string;
  cells: string[];
}) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-bold text-muted">{title}</Text>
      <View className={`rounded-xl bg-surface p-2 ${className}`}>
        {cells.map((label, index) => (
          <View
            key={`${title}-${label}-${index}`}
            className={`items-center justify-center rounded-lg px-2 py-2 ${AUTO_TRACK_COLORS[index]}`}
          >
            <Text className="text-center text-xs font-extrabold text-white">
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TemplateTrackExample({
  title,
  className,
  cells,
}: {
  title: string;
  className: string;
  cells: Array<{ label: string; className: string }>;
}) {
  return (
    <View className="gap-2">
      <Text className="text-xs font-bold text-muted">{title}</Text>
      <View className={`rounded-xl bg-surface p-2 ${className}`}>
        {cells.map((cell, index) => (
          <View
            key={`${title}-${cell.label}-${index}`}
            className={`items-center justify-center rounded-lg px-2 ${cell.className}`}
          >
            <Text className="text-center text-xs font-extrabold text-white">
              {cell.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PageTemplateExample() {
  return (
    <View className="gap-2">
      <Text className="text-xs font-bold text-muted">
        grid-template areas / rows / columns
      </Text>
      <View
        className={`overflow-hidden rounded-xl bg-surface ${PAGE_TEMPLATE_CLASS}`}
      >
        {PAGE_TEMPLATE_CELLS.map(cell => (
          <View key={cell.label} className={`px-3 py-1 ${cell.className}`}>
            <Text className="text-xl font-extrabold text-black">
              {cell.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function GridExamples() {
  return (
    <Screen>
      <Section
        title="Native gap layout"
        subtitle="React Native supports flex wrapping with gap, row-gap, and column-gap."
      >
        <Card className="flex-row flex-wrap gap-3">
          {CELLS.map(cell => (
            <View
              key={cell.label}
              className={`h-16 items-center justify-center rounded-xl ${cell.className}`}
            >
              <Text className="text-sm font-extrabold text-white">
                {cell.label}
              </Text>
            </View>
          ))}
        </Card>
      </Section>

      <Section
        title="Row and column gaps"
        subtitle="These map directly to RN style props and work natively."
      >
        <Card className="gap-y-4 gap-x-2">
          <View className="flex-row gap-x-2">
            <View className="h-12 flex-1 rounded-xl bg-primary" />
            <View className="h-12 flex-1 rounded-xl bg-accent" />
            <View className="h-12 flex-1 rounded-xl bg-success" />
          </View>
          <View className="flex-row gap-x-2">
            <View className="h-12 flex-1 rounded-xl bg-warning" />
            <View className="h-12 flex-1 rounded-xl bg-danger" />
          </View>
        </Card>
      </Section>

      <Section
        title="React Native support"
        subtitle="These are real RN style props today, so Nitrowind maps them directly."
      >
        <Card>
          {RN_LAYOUT_SUPPORT.map(item => (
            <PropertyRow key={item.name} {...item} />
          ))}
        </Card>
      </Section>

      <Section
        title="Nitrowind internal grid"
        subtitle="The shared C++ engine can calculate these layouts before the Fabric bridge is connected."
      >
        <Card className="gap-4">
          <View className="grid grid-cols-3 auto-rows-[64px] flex-row flex-wrap gap-3 rounded-xl bg-surface">
            {INTERNAL_GRID_PREVIEW.map(cell => (
              <View
                key={cell.label}
                className={`h-16 items-center justify-center rounded-xl ${cell.className}`}
              >
                <Text className="text-sm font-extrabold text-white">
                  {cell.label}
                </Text>
              </View>
            ))}
          </View>
          <View>
            {NITROWIND_GRID_SUPPORT.map(item => (
              <PropertyRow key={item.name} {...item} />
            ))}
          </View>
        </Card>
      </Section>

      <Section
        title="Auto tracks"
        subtitle="Rows and implicit columns use the same fallback metadata as grid column spans."
      >
        <Card className="gap-4">
          {AUTO_TRACK_EXAMPLES.map(example => (
            <AutoTrackExample key={example.title} {...example} />
          ))}
        </Card>
      </Section>

      <Section
        title="Template tracks"
        subtitle="Arbitrary grid column and row templates resolve to fallback item dimensions."
      >
        <Card className="gap-4">
          <PageTemplateExample />
          {TEMPLATE_TRACK_EXAMPLES.map(example => (
            <TemplateTrackExample key={example.title} {...example} />
          ))}
        </Card>
      </Section>

      <Section
        title="Bridge work"
        subtitle="These pieces connect the internal grid engine to a real native component."
      >
        <Card>
          {GRID_BRIDGE_WORK.map(item => (
            <PropertyRow key={item.name} {...item} />
          ))}
        </Card>
      </Section>

      <Section
        title="CSS Grid not native yet"
        subtitle="React Native 0.85 does not expose these browser CSS Grid props as layout styles."
      >
        <Card>
          {NOT_SUPPORTED_YET.map(item => (
            <PropertyRow key={item.name} {...item} />
          ))}
        </Card>
      </Section>

      <Caption>
        Green rows come from React Native. Blue rows are implemented inside
        Nitrowind's shared C++ grid engine. Amber rows are the remaining bridge
        to make the grid engine drive Fabric layout.
      </Caption>
    </Screen>
  );
}
