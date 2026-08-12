import type { Config } from "@docusaurus/types";
import type { Options as PresetOptions } from "@docusaurus/preset-classic";
import type { Options as DocsOptions } from "@docusaurus/plugin-content-docs";
import { themes as prismThemes } from "prism-react-renderer";

const docsUrl = process.env.DOCS_URL ?? "https://nitrowind.dev";
const docsBaseUrl = process.env.DOCS_BASE_URL ?? "/";

const structuredData = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://nitrowind.dev/#website",
      name: "Nitrowind",
      alternateName: ["Nitrowind Docs", "nitrowind.dev"],
      url: "https://nitrowind.dev/",
    },
    {
      "@type": "Organization",
      "@id": "https://nitrowind.dev/#organization",
      name: "Nitro Foundation",
      url: "https://nitrowind.dev/",
      logo: "https://nitrowind.dev/img/web-app-manifest-512x512.png",
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://nitrowind.dev/#software",
      name: "Nitrowind",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "iOS, Android, Web",
      url: "https://nitrowind.dev/",
      description:
        "An open-source React Native Tailwind CSS engine with Tailwind CSS v4 utilities and native C++ style updates.",
      license: "https://opensource.org/license/mit",
      codeRepository: "https://github.com/nitrofoundation/nitrowind",
      publisher: { "@id": "https://nitrowind.dev/#organization" },
    },
  ],
});

const config: Config = {
  title: "Nitrowind",
  tagline: "Open-source Tailwind bindings for React Native, powered by a native C++ ShadowTree engine.",
  favicon: "favicon.ico?v=20260812",
  url: docsUrl,
  baseUrl: docsBaseUrl,
  organizationName: "nitrofoundation",
  projectName: "nitrowind",
  trailingSlash: false,
  onBrokenLinks: "throw",
  headTags: [
    {
      tagName: "meta",
      attributes: {
        name: "theme-color",
        content: "#087ea4",
      },
    },
    {
      tagName: "link",
      attributes: {
        rel: "apple-touch-icon",
        href: "/img/apple-touch-icon.png",
        sizes: "180x180",
      },
    },
    {
      tagName: "link",
      attributes: {
        rel: "manifest",
        href: "/site.webmanifest",
      },
    },
    {
      tagName: "script",
      attributes: { type: "application/ld+json" },
      innerHTML: structuredData,
    },
  ],
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
          editUrl: "https://github.com/nitrofoundation/nitrowind/tree/main/apps/nitrowind-docs/",
        } satisfies DocsOptions,
        blog: false,
        sitemap: {
          ignorePatterns: ["/search"],
        },
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
    metadata: [
      {
        name: "keywords",
        content:
          "React Native Tailwind CSS, Tailwind v4, NativeWind alternative, Uniwind alternative, React Native styling, Nitrowind",
      },
    ],
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
      logo: {
        alt: "Nitrowind",
        src: "img/logo.svg",
        href: "/",
      },
      links: [
        {
          title: "Documentation",
          items: [
            { label: "Installation", to: "/getting-started/installation" },
            { label: "Features", to: "/features" },
            { label: "Theming", to: "/core-concepts/theming" },
            { label: "Migration", to: "/getting-started/migration" },
            { label: "API", to: "/api" },
            { label: "Skills", to: "/skills" },
          ],
        },
        {
          title: "Features",
          items: [
            { label: "Adaptive theming", to: "/core-concepts/adaptive-theming" },
            { label: "Container queries", to: "/features/container-queries" },
            { label: "Background images", to: "/features/background-images" },
            { label: "Animations", to: "/features/animations" },
          ],
        },
        {
          title: "Engine",
          items: [
            { label: "Architecture", to: "/native-engine/architecture" },
            { label: "iOS", to: "/native-engine/ios" },
            { label: "Android", to: "/native-engine/android" },
            { label: "Compatibility", to: "/core-concepts/compatibility" },
          ],
        },
        {
          title: "Project",
          items: [
            { label: "GitHub", href: "https://github.com/nitrofoundation/nitrowind" },
            { label: "Contributing", href: "https://github.com/nitrofoundation/nitrowind/blob/main/CONTRIBUTING.md" },
            { label: "MIT license", href: "https://github.com/nitrofoundation/nitrowind/blob/main/LICENSE" },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Nitro Foundation. Built in the open.`,
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
