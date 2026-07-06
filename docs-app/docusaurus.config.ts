import type { Config } from "@docusaurus/types";
import type { Options as PresetOptions } from "@docusaurus/preset-classic";
import type { Options as DocsOptions } from "@docusaurus/plugin-content-docs";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "Nitrowind",
  tagline: "Open-source Tailwind bindings for React Native, powered by a native C++ ShadowTree engine.",
  favicon: "img/logo.svg",
  url: "https://nitrowind.dev",
  baseUrl: "/",
  organizationName: "nitrofoundation",
  projectName: "nitrowind",
  trailingSlash: false,
  onBrokenLinks: "throw",
  clientModules: [
    "./src/client/navbarScroll.ts",
    "./src/client/searchEnhancer.ts",
  ],
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "warn",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/nitrofoundation/nitrowind/tree/main/docs-app/",
        } satisfies DocsOptions,
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies PresetOptions,
    ],
  ],

  themes: [
    [
      require.resolve("@easyops-cn/docusaurus-search-local"),
      {
        hashed: true,
        docsRouteBasePath: "/",
        indexDocs: true,
        indexPages: false,
        indexBlog: false,
        searchBarPosition: "left",
        searchBarShortcut: true,
        searchBarShortcutHint: true,
        searchResultLimits: 8,
        searchResultContextMaxLength: 72,
        explicitSearchResultPath: true,
        removeDefaultStopWordFilter: true,
      },
    ],
  ],

  themeConfig: {
    image: "img/logo.svg",
    navbar: {
      title: "Nitrowind",
      logo: {
        alt: "Nitrowind",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          type: "search",
          position: "left",
        },
        {
          href: "https://github.com/nitrofoundation/nitrowind",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            { label: "Install", to: "/getting-started/installation" },
            { label: "Core Concepts", to: "/core-concepts/how-it-works" },
            { label: "API", to: "/api/runtime" },
          ],
        },
        {
          title: "Packages",
          items: [
            { label: "nitrowind", to: "/getting-started/installation" },
            { label: "nitrocss", to: "/getting-started/plain-css" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Nitro Foundation. MIT licensed.`,
    },
    prism: {
      theme: prismThemes.oneLight,
      darkTheme: prismThemes.oneDark,
      additionalLanguages: ["bash", "css", "tsx", "diff"],
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 3,
    },
  },
};

export default config;
