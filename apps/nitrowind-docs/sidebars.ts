import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

const sidebars: SidebarsConfig = {
  docsSidebar: [
    "intro",
    "skills",
    {
      type: "category",
      label: "Getting Started",
      collapsed: false,
      items: [
        "getting-started/installation",
        "getting-started/metro",
        "getting-started/global-css",
        "getting-started/plain-css",
        "getting-started/migration",
      ],
    },
    {
      type: "category",
      label: "Core Concepts",
      collapsed: false,
      items: [
        "core-concepts/how-it-works",
        "core-concepts/runtime-state",
        "core-concepts/theming",
        "core-concepts/adaptive-theming",
        "core-concepts/platforms",
        "core-concepts/compatibility",
      ],
    },
    {
      type: "category",
      label: "Features",
      link: { type: "doc", id: "features/index" },
      collapsed: false,
      items: [
        "features/components",
        "features/states-and-groups",
        "features/responsive-and-containers",
        "features/container-queries",
        "features/safe-area",
        "features/background-images",
        "features/gradients-and-backgrounds",
        "features/effects",
        "features/animations",
        "features/svg",
        "features/native-props",
        "features/nitrowind-specific",
      ],
    },
    {
      type: "category",
      label: "API Reference",
      link: { type: "doc", id: "api/index" },
      collapsed: false,
      items: [
        "api/runtime",
        "api/components",
        "api/css-interop",
        "api/compiler",
        "api/metro",
      ],
    },
    {
      type: "category",
      label: "Native Engine",
      collapsed: false,
      items: [
        "native-engine/architecture",
        "native-engine/ios",
        "native-engine/android",
        "native-engine/fallbacks",
      ],
    },
  ],
};

export default sidebars;
