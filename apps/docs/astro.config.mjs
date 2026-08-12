import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://nitrowind.dev",
  integrations: [
    starlight({
      title: "Nitrowind",
      description:
        "Open-source Tailwind CSS v4 styling for React Native, powered by a native C++ engine.",
      favicon: "/img/favicon-96x96.png",
      head: [
        {
          tag: "link",
          attrs: { rel: "icon", href: "/favicon.ico", sizes: "any" },
        },
        {
          tag: "link",
          attrs: {
            rel: "icon",
            href: "/img/favicon-96x96.png",
            type: "image/png",
            sizes: "96x96",
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "apple-touch-icon",
            href: "/img/apple-touch-icon.png",
            sizes: "180x180",
          },
        },
        {
          tag: "link",
          attrs: { rel: "manifest", href: "/site.webmanifest" },
        },
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#087ea4" },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://nitrowind.dev/img/features/native-engine-pipeline.png",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:image",
            content: "https://nitrowind.dev/img/features/native-engine-pipeline.png",
          },
        },
      ],
      logo: {
        src: "./src/assets/logo.svg",
        alt: "Nitrowind",
        replacesTitle: true,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/nitrofoundation/nitrowind",
        },
      ],
      editLink: {
        baseUrl:
          "https://github.com/nitrofoundation/nitrowind/edit/main/apps/docs/src/content/docs/",
      },
      lastUpdated: true,
      customCss: ["./src/styles/custom.css"],
      components: {
        Head: "./src/components/Head.astro",
      },
      sidebar: [
        { label: "Overview", items: [{ label: "Introduction", slug: "intro" }, { label: "Skills", slug: "skills" }] },
        {
          label: "Getting Started",
          items: [
            { label: "Installation", slug: "getting-started/installation" },
            { label: "Metro Configuration", slug: "getting-started/metro" },
            { label: "Global CSS", slug: "getting-started/global-css" },
            { label: "Plain CSS with nitrocss", slug: "getting-started/plain-css" },
            { label: "Migrate from NativeWind or Uniwind", slug: "getting-started/migration" },
          ],
        },
        {
          label: "Core Concepts",
          items: [
            { label: "How It Works", slug: "core-concepts/how-it-works" },
            { label: "Runtime State", slug: "core-concepts/runtime-state" },
            { label: "Theming", slug: "core-concepts/theming" },
            { label: "Adaptive Theming", slug: "core-concepts/adaptive-theming" },
            { label: "Platforms", slug: "core-concepts/platforms" },
            { label: "Compatibility", slug: "core-concepts/compatibility" },
          ],
        },
        {
          label: "Features",
          items: [
            { label: "Components", slug: "features/components" },
            { label: "States and Groups", slug: "features/states-and-groups" },
            { label: "Responsive and Containers", slug: "features/responsive-and-containers" },
            { label: "Container Queries", slug: "features/container-queries" },
            { label: "Safe Area", slug: "features/safe-area" },
            { label: "Background Images", slug: "features/background-images" },
            { label: "Gradients and Backgrounds", slug: "features/gradients-and-backgrounds" },
            { label: "Effects", slug: "features/effects" },
            { label: "Animations", slug: "features/animations" },
            { label: "SVG", slug: "features/svg" },
            { label: "Native Props", slug: "features/native-props" },
            { label: "Nitrowind-Specific Features", slug: "features/nitrowind-specific" },
          ],
        },
        {
          label: "API Reference",
          items: [
            { label: "Runtime API", slug: "api/runtime" },
            { label: "Component API", slug: "api/components" },
            { label: "cssInterop", slug: "api/css-interop" },
            { label: "Compiler API", slug: "api/compiler" },
            { label: "Metro API", slug: "api/metro" },
          ],
        },
        {
          label: "Native Engine",
          items: [
            { label: "Architecture", slug: "native-engine/architecture" },
            { label: "iOS", slug: "native-engine/ios" },
            { label: "Android", slug: "native-engine/android" },
            { label: "Fallbacks", slug: "native-engine/fallbacks" },
          ],
        },
      ],
    }),
  ],
});
