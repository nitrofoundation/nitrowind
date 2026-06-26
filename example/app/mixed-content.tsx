import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo } from 'react';
import { Image, Switch } from 'react-native';
import { useHandle, useTemplate } from 'nitrolist';
import { Pressable, Text, View } from 'nitrowind';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type MixedTemplate = 'media' | 'actions' | 'stats' | 'settings' | 'article';

type MixedItem = {
  id: string;
  template: MixedTemplate;
  props: {
    enabled?: boolean;
    eyebrow?: string;
    imageUrl?: string;
    kind: MixedTemplate;
    metrics?: Array<{ label: string; value: string }>;
    primary?: string;
    secondary?: string;
    fullSpan?: boolean;
    span?: number;
    tags?: string[];
    text: string;
    title: string;
  };
};

type MixedTemplateProps = MixedItem['props'] & {
  id: string;
};

const ROW_COUNT = 1000;
const FLASHLIST_DRAW_DISTANCE = 2200;

const TEXT_VARIANTS = [
  'This row intentionally mixes an image with a title and multiline text so the final NitroList template path can prove it measures real rendered content.',
  'Rows can include controls with their own padding, hit targets, and layout constraints. The container height should follow the actual rendered control stack.',
  'Metric chips with wrapping content and compact visual density should continue to measure correctly while the list recycles rows.',
  'A switch, label, and description have different intrinsic sizes than a plain title/subtitle placeholder.',
  'This card has enough copy to wrap across several lines while preserving bottom inset and avoiding fixed native subtitle assumptions.',
  'Different images, text lengths, chips, and controls should produce different measured heights with predictable spacing.',
];

const ROWS: MixedItem[] = Array.from({ length: ROW_COUNT }, (_, index) => {
  const rowNumber = index + 1;
  const variant = index % 5;
  const text = `${TEXT_VARIANTS[index % TEXT_VARIANTS.length]} Row ${rowNumber} adds extra copy for dynamic height coverage.`;

  if (variant === 0) {
    return {
      id: `media-${rowNumber}`,
      template: 'media',
      props: {
        eyebrow: rowNumber % 2 === 0 ? 'visual asset' : 'media row',
        fullSpan: rowNumber % 10 === 1,
        kind: 'media',
        title: `Image, copy, badge, and wrapped text ${rowNumber}`,
        text,
        imageUrl: `https://picsum.photos/seed/nitrolist-media-${rowNumber}/240/160`,
      },
    };
  }

  if (variant === 1) {
    return {
      id: `actions-${rowNumber}`,
      template: 'actions',
      props: {
        kind: 'actions',
        title: `Buttons inside dynamic row ${rowNumber}`,
        text,
        primary: rowNumber % 2 === 0 ? 'Approve' : 'Assign',
        secondary: rowNumber % 2 === 0 ? 'Review' : 'Snooze',
      },
    };
  }

  if (variant === 2) {
    return {
      id: `stats-${rowNumber}`,
      template: 'stats',
      props: {
        kind: 'stats',
        span: rowNumber % 12 === 3 ? 2 : 1,
        title: `Dense metric chips ${rowNumber}`,
        text,
        metrics: [
          { label: 'Visible', value: String(12 + (rowNumber % 9)) },
          { label: 'Rendered', value: String(20 + (rowNumber % 13)) },
          { label: 'Drops', value: String(rowNumber % 3) },
          { label: 'Memory', value: `${38 + (rowNumber % 18)}MB` },
        ],
      },
    };
  }

  if (variant === 3) {
    return {
      id: `settings-${rowNumber}`,
      template: 'settings',
      props: {
        kind: 'settings',
        title: `Interactive setting row ${rowNumber}`,
        text,
        enabled: rowNumber % 2 === 0,
      },
    };
  }

  return {
    id: `article-${rowNumber}`,
    template: 'article',
    props: {
      kind: 'article',
      fullSpan: rowNumber % 15 === 0,
      title: `Long text with tags and uneven wrapping ${rowNumber}`,
      text,
      tags: [
        'auto-height',
        'template',
        rowNumber % 2 === 0 ? 'media' : 'controls',
      ],
    },
  };
});

function MediaTemplate({ eyebrow, imageUrl, text, title }: MixedTemplateProps) {
  return (
    <View className="overflow-hidden rounded-lg border border-border bg-surface-elevated">
      {imageUrl != null ? (
        <Image
          source={{ uri: imageUrl }}
          style={{ width: '100%', height: 150 }}
          resizeMode="cover"
        />
      ) : null}
      <View className="gap-2 p-4">
        <Text className="text-xs font-extrabold uppercase text-primary">
          {eyebrow}
        </Text>
        <Text className="text-lg font-extrabold text-on-surface">{title}</Text>
        <Text className="text-sm leading-5 text-muted">{text}</Text>
      </View>
    </View>
  );
}

function ActionTemplate({
  primary,
  secondary,
  text,
  title,
}: MixedTemplateProps) {
  return (
    <View className="gap-4 rounded-lg border border-border bg-surface-elevated p-4">
      <View className="gap-2">
        <Text className="text-lg font-extrabold text-on-surface">{title}</Text>
        <Text className="text-sm leading-5 text-muted">{text}</Text>
      </View>
      <View className="flex-row gap-3">
        <Pressable className="rounded-md bg-primary px-4 py-3">
          <Text className="text-sm font-extrabold text-white">{primary}</Text>
        </Pressable>
        <Pressable className="rounded-md border border-border px-4 py-3">
          <Text className="text-sm font-extrabold text-on-surface">
            {secondary}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function StatsTemplate({ metrics = [], title }: MixedTemplateProps) {
  return (
    <View className="gap-4 rounded-lg border border-border bg-surface-elevated p-4">
      <Text className="text-lg font-extrabold text-on-surface">{title}</Text>
      <View className="flex-row flex-wrap gap-2">
        {metrics.map(metric => (
          <View
            key={metric.label}
            className="min-w-24 rounded-md border border-border bg-surface px-3 py-2"
          >
            <Text className="text-xs font-bold text-muted">{metric.label}</Text>
            <Text className="mt-1 text-base font-extrabold text-on-surface">
              {metric.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SettingsTemplate({
  enabled = false,
  text,
  title,
}: MixedTemplateProps) {
  return (
    <View className="flex-row items-center gap-4 rounded-lg border border-border bg-surface-elevated p-4">
      <View className="flex-1 gap-2">
        <Text className="text-lg font-extrabold text-on-surface">{title}</Text>
        <Text className="text-sm leading-5 text-muted">{text}</Text>
      </View>
      <Switch value={enabled} />
    </View>
  );
}

function ArticleTemplate({ tags = [], text, title }: MixedTemplateProps) {
  return (
    <View className="gap-4 rounded-lg border border-border bg-surface-elevated p-4">
      <View className="gap-2">
        <Text className="text-lg font-extrabold text-on-surface">{title}</Text>
        <Text className="text-sm leading-5 text-muted">{text}</Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {tags.map(tag => (
          <View key={tag} className="rounded-md bg-surface px-3 py-1.5">
            <Text className="text-xs font-bold text-primary">{tag}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const TEMPLATES = {
  actions: ActionTemplate,
  article: ArticleTemplate,
  media: MediaTemplate,
  settings: SettingsTemplate,
  stats: StatsTemplate,
};

export default function MixedContentScreen() {
  const insets = useSafeAreaInsets();
  const templates = useTemplate(TEMPLATES, {
    scope: 'nitrolist-mixed-content',
  });
  const nitroItems = useMemo(() => templates.bindItems(ROWS), [templates]);
  const options = useMemo(
    () => ({
      estimatedItemHeight: 180,
      layout: 'grid' as const,
      numColumns: 2,
      columnGap: 8,
      rowGap: 8,
      overscanScreens: 1.5,
      viewabilityConfig: {
        fallbackIndex: 0,
        overscanAfter: 3,
        overscanBefore: 3,
        windowSize: 6,
      },
    }),
    [],
  );
  const { handle, status } = useHandle(nitroItems, options, {
    autoCreate: true,
    disposeOnUnmount: true,
  });

  const renderItem = useCallback(({ item }: { item: MixedItem }) => {
    const Template = TEMPLATES[item.template];
    return (
      <View className={item.props.fullSpan ? 'col-span-2 p-1' : 'p-1'}>
        <Template id={item.id} {...item.props} />
      </View>
    );
  }, []);

  return (
    <View className="flex-1 bg-surface">
      <View className="border-b border-border px-4 py-2">
        <Text className="text-xs font-bold text-muted">{status}</Text>
      </View>
      {handle == null ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-sm font-bold text-muted">
            Creating mixed NitroList...
          </Text>
        </View>
      ) : (
        <FlashList
          contentContainerStyle={{
            paddingBottom: insets.bottom + 12,
            paddingTop: 16,
          }}
          data={ROWS}
          drawDistance={FLASHLIST_DRAW_DISTANCE}
          getItemType={item => item.template}
          keyExtractor={item => item.id}
          maintainVisibleContentPosition={{ disabled: true }}
          masonry
          numColumns={2}
          overrideItemLayout={(layout, item) => {
            layout.span = item.props.fullSpan ? 2 : Math.min(item.props.span ?? 1, 2);
          }}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}
