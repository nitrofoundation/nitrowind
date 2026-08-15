import Link from 'next/link';

type Support = 'Full' | 'Platform API' | 'CSS' | 'iOS' | 'Fallback' | 'Planned';

type Feature = {
  description: string;
  href: string;
  native: Support;
  title: string;
  web: Support;
};

const groups: Array<{ features: Feature[]; title: string }> = [
  {
    title: 'Runtime & layout',
    features: [
      {
        title: 'Components',
        href: '/docs/features/components',
        description: 'ClassName-aware native primitives and scrollables.',
        native: 'Full',
        web: 'Full',
      },
      {
        title: 'States & groups',
        href: '/docs/features/states-and-groups',
        description: 'Active, focus, hover, disabled, and parent group state.',
        native: 'Platform API',
        web: 'CSS',
      },
      {
        title: 'Responsive utilities',
        href: '/docs/features/responsive-and-containers',
        description: 'Viewport, orientation, and runtime dimension variants.',
        native: 'Full',
        web: 'CSS',
      },
      {
        title: 'Container queries',
        href: '/docs/features/container-queries',
        description: 'Width, height, named, and custom container conditions.',
        native: 'Full',
        web: 'CSS',
      },
      {
        title: 'Safe area',
        href: '/docs/features/safe-area',
        description: 'Padding, margin, inset, and safe screen-height utilities.',
        native: 'Platform API',
        web: 'Fallback',
      },
    ],
  },
  {
    title: 'Native paint',
    features: [
      {
        title: 'Background images',
        href: '/docs/features/background-images',
        description: 'Cover, contain, stretch, repeat, and focal positioning.',
        native: 'Full',
        web: 'CSS',
      },
      {
        title: 'Gradients & borders',
        href: '/docs/features/gradients',
        description: 'Linear, radial, conic, arbitrary, and border gradients.',
        native: 'Full',
        web: 'CSS',
      },
      {
        title: 'P3 & native colors',
        href: '/docs/features/p3-colors',
        description: 'Wide-gamut and semantic theme-dependent color tokens.',
        native: 'Platform API',
        web: 'CSS',
      },
      {
        title: 'Masks',
        href: '/docs/features/masks',
        description: 'URL and gradient alpha masks with native updates.',
        native: 'Full',
        web: 'CSS',
      },
      {
        title: 'Clip paths',
        href: '/docs/features/clip-paths',
        description: 'Circle, inset, polygon, and supported native geometry.',
        native: 'Full',
        web: 'CSS',
      },
      {
        title: 'Filters & shadows',
        href: '/docs/features/filters-and-shadows',
        description: 'Box/text shadows, transforms, filters, and backdrop filters.',
        native: 'Platform API',
        web: 'CSS',
      },
    ],
  },
  {
    title: 'Motion & integration',
    features: [
      {
        title: 'Animations',
        href: '/docs/features/animations',
        description: 'Entering, exiting, layout, and CSS keyframe utilities.',
        native: 'Full',
        web: 'CSS',
      },
      {
        title: 'Scroll-driven animations',
        href: '/docs/features/scroll-driven-animations',
        description: 'Native scroll timelines without a JavaScript onScroll loop.',
        native: 'iOS',
        web: 'CSS',
      },
      {
        title: 'SVG',
        href: '/docs/features/svg',
        description: 'ClassName-aware react-native-svg paint primitives.',
        native: 'Full',
        web: 'Full',
      },
      {
        title: 'Native props',
        href: '/docs/features/native-props',
        description: 'Map utility colors to component-specific host props.',
        native: 'Platform API',
        web: 'Fallback',
      },
      {
        title: 'Nitrowind-specific',
        href: '/docs/features/nitrowind-specific',
        description: 'ShadowTree updates, native grid, paint descriptors, and plain CSS.',
        native: 'Full',
        web: 'Fallback',
      },
    ],
  },
];

export default function FeaturePlatformGrid() {
  return (
    <div className="feature-support-groups">
      {groups.map(group => (
        <section className="feature-support-group" key={group.title}>
          <div className="feature-support-heading">
            <h2>{group.title}</h2>
            <div aria-label="Platform columns">
              <span>Native</span>
              <span>Web</span>
            </div>
          </div>
          <div className="feature-support-list">
            {group.features.map(feature => (
              <Link className="feature-support-row" href={feature.href} key={feature.href}>
                <span>
                  <strong>{feature.title}</strong>
                  <small>{feature.description}</small>
                </span>
                <SupportBadge value={feature.native} />
                <SupportBadge value={feature.web} />
                <b aria-hidden="true">→</b>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SupportBadge({ value }: { value: Support }) {
  const tone =
    value === 'Full' || value === 'CSS' ? 'complete' : value === 'Planned' ? 'planned' : 'native';
  return <span className={`support-badge support-badge-${tone}`}>{value}</span>;
}
