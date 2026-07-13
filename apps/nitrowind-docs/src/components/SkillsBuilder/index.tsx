import React, { useEffect, useMemo, useState } from "react";

type SkillPreset = {
  id: string;
  title: string;
  summary: string;
  docs: string[];
  workflow: string[];
};

const presets: SkillPreset[] = [
  {
    id: "nitrowind-setup",
    title: "Setup",
    summary: "Install Nitrowind, configure Metro, and connect Tailwind v4 CSS.",
    docs: ["/getting-started/installation", "/getting-started/metro", "/getting-started/global-css"],
    workflow: ["Inspect dependencies and app entry points.", "Configure Metro and one CSS entry file together.", "Verify with a styled native primitive."],
  },
  {
    id: "nitrowind-migration",
    title: "Migration",
    summary: "Move a NativeWind or Uniwind app to Nitrowind safely.",
    docs: ["/getting-started/migration", "/getting-started/installation", "/core-concepts/compatibility"],
    workflow: ["Inventory the existing styling setup.", "Replace Metro and CSS configuration deliberately.", "Call out unsupported web-only CSS."],
  },
  {
    id: "nitrocss-plain-css",
    title: "Plain CSS",
    summary: "Use Nitrocss directly without Tailwind utilities.",
    docs: ["/getting-started/plain-css", "/api/metro", "/core-concepts/compatibility"],
    workflow: ["Use the Nitrocss Metro entry point.", "Keep authored CSS within native capabilities.", "Confirm Metro scans class candidates."],
  },
  {
    id: "nitrowind-theming",
    title: "Adaptive theming",
    summary: "Create named themes and light, dark, and system behavior.",
    docs: ["/core-concepts/theming", "/core-concepts/adaptive-theming", "/api/runtime"],
    workflow: ["Define semantic theme variables.", "Use setTheme for named choices.", "Use setColorScheme for adaptive behavior."],
  },
  {
    id: "nitrowind-components-interop",
    title: "Components and interop",
    summary: "Style native and third-party components with className mappings.",
    docs: ["/features/components", "/api/css-interop", "/features/native-props"],
    workflow: ["Prefer supported wrappers.", "Map classes to the component's real visual props.", "Separate container and content styles."],
  },
  {
    id: "nitrowind-interaction-states",
    title: "Interaction states",
    summary: "Build pressed, disabled, focus, hover, and group-state UI.",
    docs: ["/features/states-and-groups", "/features/components", "/core-concepts/runtime-state"],
    workflow: ["Use supported variants on the interactive primitive.", "Choose Pressable-compatible controls.", "Use group markers only for parent-driven state."],
  },
  {
    id: "nitrowind-responsive-layouts",
    title: "Responsive layouts",
    summary: "Adapt layout to dimensions, platform, RTL, and font scale.",
    docs: ["/features/responsive-and-containers", "/core-concepts/platforms", "/core-concepts/runtime-state"],
    workflow: ["Use responsive utilities for screen changes.", "Use platform variants for platform differences.", "Switch to a container query for parent-size logic."],
  },
  {
    id: "nitrowind-container-queries",
    title: "Container queries",
    summary: "Make a component respond to the measured size of its parent.",
    docs: ["/features/container-queries", "/features/responsive-and-containers", "/core-concepts/how-it-works"],
    workflow: ["Mark the layout boundary as a container.", "Use named containers for nested layouts.", "Keep screen and container conditions distinct."],
  },
  {
    id: "nitrowind-safe-area",
    title: "Safe area",
    summary: "Apply inset-aware spacing and screen layouts.",
    docs: ["/features/safe-area", "/core-concepts/runtime-state", "/getting-started/global-css"],
    workflow: ["Use safe-area utilities at visual edges.", "Combine insets with design spacing.", "Confirm safe-area data reaches the app."],
  },
  {
    id: "nitrowind-background-images",
    title: "Background images",
    summary: "Paint native image backgrounds, focal positions, and repeat patterns.",
    docs: ["/features/background-images", "/features/gradients-and-backgrounds", "/core-concepts/compatibility"],
    workflow: ["Use CSS URL backgrounds for decorative surfaces.", "Use a clearly tileable asset for repeat options.", "Use Image for semantic or interactive content."],
  },
  {
    id: "nitrowind-native-effects",
    title: "Native effects",
    summary: "Use gradients, gradient borders, shadows, filters, and clip paths.",
    docs: ["/features/gradients-and-backgrounds", "/features/effects", "/features/nitrowind-specific"],
    workflow: ["Start from supported CSS declarations.", "Use theme variables for reactive tokens.", "Describe native fallbacks honestly."],
  },
  {
    id: "nitrowind-animations",
    title: "Animations",
    summary: "Add entering, exiting, layout, and CSS-keyframe helpers.",
    docs: ["/features/animations", "/getting-started/installation", "/getting-started/metro"],
    workflow: ["Confirm Reanimated is installed.", "Use lifecycle utilities for mount and layout changes.", "Use keyframes for visual animation."],
  },
  {
    id: "nitrowind-svg",
    title: "SVG styling",
    summary: "Style react-native-svg fill, stroke, and sizing with className.",
    docs: ["/features/svg", "/features/components", "/getting-started/installation"],
    workflow: ["Use supported SVG primitives or wrappers.", "Put paint classes on the owning SVG element.", "Keep structural SVG definitions separate."],
  },
  {
    id: "nitrowind-native-props",
    title: "Native props",
    summary: "Map className values to component-specific native visual props.",
    docs: ["/features/native-props", "/features/components", "/api/css-interop"],
    workflow: ["Identify the target visual prop.", "Map only the classes that target it.", "Keep unrelated classes out of the mapping."],
  },
  {
    id: "nitrowind-native-engine",
    title: "Native engine",
    summary: "Reason about ShadowTree updates, dependencies, and fallbacks.",
    docs: ["/core-concepts/how-it-works", "/native-engine/architecture", "/native-engine/fallbacks", "/core-concepts/compatibility"],
    workflow: ["Trace CSS through compilation and runtime dependencies.", "Use native behavior where it is supported.", "Validate target platform requirements."],
  },
];

const normalizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);

const renderSkill = (preset: SkillPreset, name: string, intent: string) => `---
name: ${normalizeName(name) || preset.id}
description: ${JSON.stringify(`${(intent || preset.summary).trim()} Use this skill whenever the user asks about ${preset.title.toLowerCase()} in a Nitrowind or Nitrocss React Native project.`)}
---

# ${name || preset.title}

Use this skill to implement supported Nitrowind behavior. Read the linked canonical docs before changing configuration or relying on a native capability.

## Workflow

${preset.workflow.map((step) => `1. ${step}`).join("\n")}

## Canonical docs

${preset.docs.map((doc) => `- [${doc}](${doc})`).join("\n")}

## Validate

- Run the narrowest relevant build or typecheck after changing code or configuration.
- Keep the result native-first and explain platform limits instead of assuming browser behavior.
`;

export default function SkillsBuilder(): React.ReactNode {
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "nitrowind-setup");
  const [name, setName] = useState("nitrowind-setup");
  const [intent, setIntent] = useState("");
  const [copied, setCopied] = useState(false);
  const preset = presets.find((item) => item.id === presetId) ?? presets[0]!;

  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get("preset");
    if (!selected || !presets.some((item) => item.id === selected)) return;
    setPresetId(selected);
    setName(selected);
  }, []);

  const markdown = useMemo(
    () => renderSkill(preset, name, intent),
    [intent, name, preset],
  );

  const updatePreset = (nextPresetId: string) => {
    const next = presets.find((item) => item.id === nextPresetId);
    if (!next) return;
    setPresetId(nextPresetId);
    setName(next.id);
    setIntent("");
  };

  const copy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const download = () => {
    const file = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "SKILL.md";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="skills-builder" id="skill-builder" aria-labelledby="skills-builder-title">
      <div className="skills-builder-heading">
        <div>
          <span className="docs-eyebrow">Interactive builder</span>
          <h2 id="skills-builder-title">Create a focused skill</h2>
        </div>
        <p>Choose a proven workflow, then describe the job your agent should own.</p>
      </div>
      <div className="skills-builder-grid">
        <div className="skills-builder-controls">
          <label htmlFor="skill-preset">Nitrowind workflow</label>
          <select id="skill-preset" value={presetId} onChange={(event) => updatePreset(event.target.value)}>
            {presets.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>

          <label htmlFor="skill-name">Skill name</label>
          <input id="skill-name" value={name} maxLength={63} onChange={(event) => setName(normalizeName(event.target.value))} />
          <span className="skills-builder-hint">Lowercase letters, numbers, and hyphens only.</span>

          <label htmlFor="skill-intent">Project-specific intent</label>
          <textarea id="skill-intent" value={intent} onChange={(event) => setIntent(event.target.value)} placeholder={preset.summary} rows={5} />

          <div className="skills-builder-summary">
            <strong>{preset.title}</strong>
            <p>{preset.summary}</p>
          </div>
        </div>

        <div className="skills-builder-preview">
          <div className="skills-builder-preview-bar">
            <span>SKILL.md</span>
            <div>
              <button className="skills-builder-copy" type="button" onClick={() => void copy()} title="Copy SKILL.md">{copied ? "Copied" : "Copy"}</button>
              <button className="skills-builder-download" type="button" onClick={download}>Download</button>
            </div>
          </div>
          <pre><code>{markdown}</code></pre>
        </div>
      </div>
    </section>
  );
}
