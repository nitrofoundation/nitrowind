'use client';

import { useState } from 'react';

const categories = {
  styling: {
    label: 'Styling',
    features: ['Tailwind CSS v4', 'Semantic themes', 'Dark mode', 'Platform variants', 'Safe area'],
    code: 'className="bg-surface\n dark:bg-slate-950\n pt-safe ios:tracking-tight"',
  },
  layout: {
    label: 'Layout',
    features: [
      'Responsive breakpoints',
      'Container queries',
      'RTL support',
      'Font scale',
      'Flexbox layouts',
    ],
    code: 'className="@container\n p-4 @md:flex-row\n rtl:-translate-x-2"',
  },
  effects: {
    label: 'Effects',
    features: [
      'Background images',
      'Gradients & borders',
      'Shadows & filters',
      'Masks',
      'Clip paths',
    ],
    code: 'className="bg-linear-to-br\n from-cyan-400 to-blue-600\n shadow-lg"',
  },
  motion: {
    label: 'Motion',
    features: [
      'CSS keyframes',
      'Entering & exiting',
      'Layout animations',
      'Scroll timelines',
      'Interaction states',
    ],
    code: 'className="entering-fade-in\n layout-springify\n active:scale-95"',
  },
} as const;

export default function RuntimePreview() {
  const [category, setCategory] = useState<keyof typeof categories>('effects');
  const active = categories[category];
  return (
    <div className="runtime-panel">
      <div className="runtime-bar">
        <span>
          <i /> What Nitrowind supports
        </span>
        <span className="runtime-engine">native engine</span>
      </div>
      <div className="runtime-tabs">
        {Object.entries(categories).map(([key, item]) => (
          <button
            className={category === key ? 'active' : ''}
            key={key}
            onClick={() => setCategory(key as keyof typeof categories)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="runtime-workspace">
        <pre>
          <code>{active.code}</code>
        </pre>
        <div className="runtime-phone">
          <div className="runtime-status">
            <span>Nitrowind</span>
            <span>{active.label}</span>
          </div>
          <p className="runtime-label">SUPPORTED</p>
          <div className="runtime-feature-list">
            {active.features.map((feature, index) => (
              <div key={feature}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                {feature}
                <b>✓</b>
              </div>
            ))}
          </div>
          <div className="runtime-action">
            Native updates <b>0 React renders</b>
          </div>
        </div>
      </div>
    </div>
  );
}
