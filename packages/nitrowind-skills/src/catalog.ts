export type SkillDefinition = {
  id: string;
  title: string;
  summary: string;
  triggers: string[];
  workflow: string[];
  docs: Array<{ label: string; path: string }>;
};

export const skillCatalog: SkillDefinition[] = [
  {
    id: "nitrowind-setup",
    title: "Nitrowind Setup",
    summary: "Install Nitrowind, configure Metro, and connect a Tailwind v4 CSS entry file.",
    triggers: ["add Nitrowind", "configure Metro", "set up Tailwind styling"],
    workflow: [
      "Inspect the existing React Native or Expo setup before changing dependencies.",
      "Configure the Metro wrapper and CSS entry file together, then import the CSS once from the app entry point.",
      "Keep the setup minimal and verify it with one styled native primitive.",
    ],
    docs: [
      { label: "Installation", path: "/getting-started/installation" },
      { label: "Metro", path: "/getting-started/metro" },
      { label: "Global CSS", path: "/getting-started/global-css" },
    ],
  },
  {
    id: "nitrowind-migration",
    title: "Migrate to Nitrowind",
    summary: "Move a NativeWind or Uniwind project to Nitrowind without guessing at configuration changes.",
    triggers: ["migrate from NativeWind", "replace Uniwind", "remove NativeWind config"],
    workflow: [
      "Inventory the current dependencies, Babel setup, Metro configuration, and CSS entry points first.",
      "Apply the Nitrowind Metro and CSS configuration while preserving working component class names where possible.",
      "Call out unsupported browser-only CSS instead of silently promising parity.",
    ],
    docs: [
      { label: "Migration", path: "/getting-started/migration" },
      { label: "Installation", path: "/getting-started/installation" },
      { label: "Compatibility", path: "/core-concepts/compatibility" },
    ],
  },
  {
    id: "nitrocss-plain-css",
    title: "Nitrocss Plain CSS",
    summary: "Use the native Nitrowind engine directly with authored CSS classes instead of Tailwind utilities.",
    triggers: ["use plain CSS", "configure NitroCSS", "no Tailwind"],
    workflow: [
      "Use the Nitrocss Metro entry point and a single source CSS file.",
      "Keep authored classes aligned with native React Native capabilities and describe any intentional platform fallback.",
      "Verify that the class candidates are scanned by Metro before debugging runtime styles.",
    ],
    docs: [
      { label: "Plain CSS", path: "/getting-started/plain-css" },
      { label: "Metro API", path: "/api/metro" },
      { label: "Compatibility", path: "/core-concepts/compatibility" },
    ],
  },
  {
    id: "nitrowind-theming",
    title: "Nitrowind Theming",
    summary: "Create named themes and adaptive light, dark, and system-driven styling.",
    triggers: ["add a theme", "dark mode", "adaptive theme", "theme variables"],
    workflow: [
      "Define semantic CSS variables before consuming them from className utilities.",
      "Use setTheme for an explicit named theme and setColorScheme for light, dark, or system behavior.",
      "Treat theme changes as runtime state; do not add React state unless the UI also needs its own state.",
    ],
    docs: [
      { label: "Theming", path: "/core-concepts/theming" },
      { label: "Adaptive Theming", path: "/core-concepts/adaptive-theming" },
      { label: "Runtime API", path: "/api/runtime" },
    ],
  },
  {
    id: "nitrowind-components-interop",
    title: "Components and Interop",
    summary: "Style React Native primitives and third-party components with className-aware wrappers.",
    triggers: ["style a third-party component", "cssInterop", "add className to component"],
    workflow: [
      "Prefer Nitrowind's exported wrappers for supported React Native primitives.",
      "Use cssInterop or withNitroCss to map className output to the component props that actually accept styles.",
      "Separate container, content-container, and text style props when the target component has more than one styling surface.",
    ],
    docs: [
      { label: "Components", path: "/features/components" },
      { label: "cssInterop", path: "/api/css-interop" },
      { label: "Native Props", path: "/features/native-props" },
    ],
  },
  {
    id: "nitrowind-interaction-states",
    title: "Interaction States",
    summary: "Build pressed, focused, disabled, hover, and group-state UI with native state-aware variants.",
    triggers: ["pressed styles", "disabled state", "group hover", "focus styling"],
    workflow: [
      "Use supported state variants on the component that owns the interaction.",
      "Choose Pressable-compatible primitives when a state needs native press feedback.",
      "Use group markers only when a parent state should drive descendants.",
    ],
    docs: [
      { label: "States and Groups", path: "/features/states-and-groups" },
      { label: "Components", path: "/features/components" },
      { label: "Runtime State", path: "/core-concepts/runtime-state" },
    ],
  },
  {
    id: "nitrowind-responsive-layouts",
    title: "Responsive Layouts",
    summary: "Adapt React Native layouts to screen dimensions, orientation, platform, RTL, and font scale.",
    triggers: ["responsive layout", "orientation styles", "platform variant", "font scale"],
    workflow: [
      "Use responsive utilities for screen-level changes and keep structural layout simple.",
      "Use platform variants for native platform differences instead of runtime conditionals where possible.",
      "Use container queries when the parent size, not the screen, defines the layout.",
    ],
    docs: [
      { label: "Responsive and Containers", path: "/features/responsive-and-containers" },
      { label: "Platforms", path: "/core-concepts/platforms" },
      { label: "Runtime State", path: "/core-concepts/runtime-state" },
    ],
  },
  {
    id: "nitrowind-container-queries",
    title: "Container Queries",
    summary: "Create parent-size-aware components with named, width, height, and custom container queries.",
    triggers: ["container query", "responsive card", "parent width", "cq syntax"],
    workflow: [
      "Mark the nearest layout boundary as a container before applying child query variants.",
      "Use named containers where nested components must target a specific parent.",
      "Keep screen breakpoints and container conditions distinct so the resulting behavior stays legible.",
    ],
    docs: [
      { label: "Container Queries", path: "/features/container-queries" },
      { label: "Responsive and Containers", path: "/features/responsive-and-containers" },
      { label: "How It Works", path: "/core-concepts/how-it-works" },
    ],
  },
  {
    id: "nitrowind-safe-area",
    title: "Safe Area Layout",
    summary: "Apply safe-area-aware spacing and screen layouts without manually threading inset values through every component.",
    triggers: ["safe area", "notch padding", "screen safe", "inset utilities"],
    workflow: [
      "Use the safe-area utility family for edges that are part of the visual layout.",
      "Combine safe-area values with spacing utilities when an edge needs both a device inset and design spacing.",
      "Confirm the app provides safe-area information before debugging native inset values.",
    ],
    docs: [
      { label: "Safe Area", path: "/features/safe-area" },
      { label: "Runtime State", path: "/core-concepts/runtime-state" },
      { label: "Global CSS", path: "/getting-started/global-css" },
    ],
  },
  {
    id: "nitrowind-background-images",
    title: "Background Images",
    summary: "Paint native background images with cover, contain, stretch, repeat, repeat-x, repeat-y, and focal position.",
    triggers: ["background image", "background repeat", "image cover", "native background"],
    workflow: [
      "Use a CSS URL background when the image is decorative and belongs on the view surface.",
      "Choose repeat, repeat-x, or repeat-y only with a visually tileable asset.",
      "Use an Image component instead when the image is content that needs accessibility, loading, or interaction behavior.",
    ],
    docs: [
      { label: "Background Images", path: "/features/background-images" },
      { label: "Gradients and Backgrounds", path: "/features/gradients-and-backgrounds" },
      { label: "Compatibility", path: "/core-concepts/compatibility" },
    ],
  },
  {
    id: "nitrowind-native-effects",
    title: "Native Visual Effects",
    summary: "Use native gradients, gradient borders, shadows, filters, text shadows, and clip paths with deliberate platform fallbacks.",
    triggers: ["gradient border", "clip path", "backdrop blur", "text shadow", "native effects"],
    workflow: [
      "Start with a supported CSS declaration and preserve a readable base style for fallbacks.",
      "Use theme variables for visual tokens that should react to theme changes.",
      "Avoid web-only effect assumptions and explain the supported native boundary in the final implementation.",
    ],
    docs: [
      { label: "Gradients and Backgrounds", path: "/features/gradients-and-backgrounds" },
      { label: "Effects", path: "/features/effects" },
      { label: "Nitrowind-Specific Features", path: "/features/nitrowind-specific" },
    ],
  },
  {
    id: "nitrowind-animations",
    title: "Nitrowind Animations",
    summary: "Add entering, exiting, layout, spring, easing, and CSS-keyframe animation helpers through Reanimated.",
    triggers: ["entering animation", "layout animation", "Tailwind animation", "Reanimated utility"],
    workflow: [
      "Confirm react-native-reanimated is installed before selecting an animation utility family.",
      "Use entering, exiting, and layout utilities for component lifecycle and layout changes.",
      "Use CSS-keyframe helpers for visual animation and keep worklets for behavior that needs imperative control.",
    ],
    docs: [
      { label: "Animations", path: "/features/animations" },
      { label: "Installation", path: "/getting-started/installation" },
      { label: "Metro", path: "/getting-started/metro" },
    ],
  },
  {
    id: "nitrowind-svg",
    title: "SVG Styling",
    summary: "Use Tailwind className styles for react-native-svg paint, stroke, fill, and sizing properties.",
    triggers: ["style SVG", "fill class", "stroke class", "react-native-svg"],
    workflow: [
      "Import supported SVG primitives from the Nitrowind SVG entry point or wrap a compatible export.",
      "Apply paint and geometry classes to the SVG element that owns the corresponding prop.",
      "Keep structural SVG definitions separate from className-styled painted elements.",
    ],
    docs: [
      { label: "SVG", path: "/features/svg" },
      { label: "Components", path: "/features/components" },
      { label: "Installation", path: "/getting-started/installation" },
    ],
  },
  {
    id: "nitrowind-native-props",
    title: "Native Props",
    summary: "Map className styles to native component props such as colors, indicators, and component-specific visual settings.",
    triggers: ["native prop", "className prop mapping", "style component props"],
    workflow: [
      "Identify whether the target exposes a style prop or a dedicated native visual prop.",
      "Use a component wrapper or prop mapping when a value cannot live in the ordinary style object.",
      "Keep prop mapping narrow so it does not accidentally pass unrelated classes to unsupported props.",
    ],
    docs: [
      { label: "Native Props", path: "/features/native-props" },
      { label: "Components", path: "/features/components" },
      { label: "cssInterop", path: "/api/css-interop" },
    ],
  },
  {
    id: "nitrowind-native-engine",
    title: "Nitrowind Native Engine",
    summary: "Work with the native C++ ShadowTree engine, runtime dependencies, diagnostics, and safe fallbacks.",
    triggers: ["Nitrowind engine", "ShadowTree", "native style update", "runtime fallback"],
    workflow: [
      "Trace a styling problem from CSS compilation through the runtime dependency that should update it.",
      "Prefer native resolver behavior for supported capabilities and clearly preserve the JS fallback boundary.",
      "Validate against the target platform and new-architecture requirements before diagnosing engine behavior.",
    ],
    docs: [
      { label: "How It Works", path: "/core-concepts/how-it-works" },
      { label: "Native Architecture", path: "/native-engine/architecture" },
      { label: "Fallbacks", path: "/native-engine/fallbacks" },
      { label: "Compatibility", path: "/core-concepts/compatibility" },
    ],
  },
];

export const skillById = (id: string) =>
  skillCatalog.find((skill) => skill.id === id);

const titleFromId = (id: string) =>
  id
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");

const yamlString = (value: string) => JSON.stringify(value);

export const normalizeSkillName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);

export const renderSkill = (
  definition: SkillDefinition,
  overrides: { name?: string; description?: string } = {},
) => {
  const name = normalizeSkillName(overrides.name ?? definition.id) || definition.id;
  const description = overrides.description?.trim() || definition.summary;
  const workflow = definition.workflow.map((step) => `1. ${step}`).join("\n");
  const docs = definition.docs
    .map((doc) => `- [${doc.label}](${doc.path})`)
    .join("\n");

  const frontmatterDescription = `${description} Use this skill whenever the user mentions ${definition.triggers.map((trigger) => `"${trigger}"`).join(", ")} in a Nitrowind or Nitrocss React Native project.`;

  return `---
name: ${name}
description: ${yamlString(frontmatterDescription)}
---

# ${overrides.name ? titleFromId(name) : definition.title}

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before relying on a detail that affects configuration, native support, or runtime updates.

## Workflow

${workflow}

## Canonical docs

${docs}

## Validate

- Run the narrowest relevant build or typecheck after changing configuration or code.
- Keep examples native-first and call out platform limits instead of implying browser behavior works in React Native.
`;
};

export const renderOpenAiMetadata = (definition: SkillDefinition, name = definition.id) => `interface:
  display_name: ${yamlString(definition.title)}
  short_description: ${yamlString(definition.summary)}
  default_prompt: ${yamlString(`Help me with ${name.replace(/-/g, " ")} in my Nitrowind app.`)}
`;
