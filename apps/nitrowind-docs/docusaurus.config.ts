import type { Config } from "@docusaurus/types";
import type { Options as PresetOptions } from "@docusaurus/preset-classic";
import type { Options as DocsOptions } from "@docusaurus/plugin-content-docs";
import { themes as prismThemes } from "prism-react-renderer";

const docsUrl = process.env.DOCS_URL ?? "http://localhost:8080";
const docsBaseUrl = process.env.DOCS_BASE_URL ?? "/";

const config: Config = {
  title: "Nitrowind",
  tagline: "Open-source Tailwind bindings for React Native, powered by a native C++ ShadowTree engine.",
  favicon: "img/favicon.svg",
  url: docsUrl,
  baseUrl: docsBaseUrl,
  organizationName: "AshwithJoylan",
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
          editUrl: "https://github.com/AshwithJoylan//nitrowind/tree/main/apps/nitrowind-docs/",
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
          href: "https://github.com/AshwithJoylan/nitrowind",
          label: "GitHub",
          position: "right",
        },
      ],
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
