import React, { useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";

type Feature = "mask" | "gradient";
type CodeTab = "tsx" | "css";

const utilityColors: Record<string, string> = {
  "blue-600": "#2563eb",
  "cyan-400": "#22d3ee",
  "emerald-400": "#34d399",
  "fuchsia-500": "#d946ef",
  "orange-500": "#f97316",
  "rose-500": "#f43f5e",
  "sky-500": "#0ea5e9",
  "teal-400": "#2dd4bf",
  "violet-700": "#6d28d9",
};

const variantGradients = [
  "linear-gradient(135deg, #22d3ee, #2563eb 54%, #6d28d9)",
  "linear-gradient(135deg, #fb7185, #f97316 46%, #7c3aed)",
  "linear-gradient(135deg, #2dd4bf, #0ea5e9 48%, #1e3a8a)",
];

function classNameFrom(code: string): string {
  return code.match(/className=["']([^"']+)["']/)?.[1] ?? "";
}

function gradientFromCode(code: string): string | undefined {
  const className = classNameFrom(code);
  const stops = ["from", "via", "to"].map((prefix) => {
    const match = className.match(new RegExp(`(?:^|\\s)${prefix}-([\\w-]+)`));
    return match ? utilityColors[match[1]] : undefined;
  }).filter((color): color is string => Boolean(color));
  if (stops.length < 2) return undefined;

  const direction = className.match(/bg-linear-to-([a-z]+)/)?.[1];
  const angle = direction === "tr" ? "45deg" : direction === "tl" ? "315deg" : direction === "br" ? "135deg" : direction === "bl" ? "225deg" : "180deg";
  return `linear-gradient(${angle}, ${stops.join(", ")})`;
}

function maskFromCode(code: string): Pick<React.CSSProperties, "maskImage" | "maskPosition" | "maskSize" | "transform"> {
  const image = code.match(/mask-image:\s*([^;]+);/)?.[1];
  const position = code.match(/mask-position:\s*([^;]+);/)?.[1];
  const size = code.match(/mask-size:\s*([^;]+);/)?.[1];
  const scale = code.match(/--mask-scale:\s*([\d.]+)/)?.[1];
  return {
    ...(image ? { maskImage: image, WebkitMaskImage: image } : {}),
    ...(position ? { maskPosition: position, WebkitMaskPosition: position } : {}),
    ...(size ? { maskSize: size, WebkitMaskSize: size } : {}),
    ...(scale ? { transform: `scale(${scale})` } : {}),
  } as React.CSSProperties;
}

const maskTsx = `import { Image, View } from "react-native";

export function MaskedPhoto() {
  return (
    <View className="mask-reveal animate-mask-reveal h-64 overflow-hidden rounded-3xl">
      <Image
        source={{ uri: photoUrl }}
        className="h-full w-full"
      />
    </View>
  );
}`;

const maskCss = `@keyframes mask-reveal {
  from { --mask-scale: 0.72; opacity: 0; }
  to { --mask-scale: 1; opacity: 1; }
}

.mask-reveal {
  mask-image: radial-gradient(circle, black 46%, transparent 68%);
  mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
}`;

const gradientTsx = `import { View } from "react-native";

export function GradientCard() {
  return (
    <View className="h-64 rounded-3xl bg-linear-to-br from-cyan-400 via-blue-600 to-violet-700" />
  );
}`;

const gradientCss = `.hero-surface {
  background: linear-gradient(
    135deg,
    var(--color-cyan-400),
    var(--color-blue-600) 52%,
    var(--color-violet-700)
  );
}`;

const featureContent = {
  mask: {
    description: "Tune the native mask layer. The painted content stays in place.",
    title: "Native mask reveal",
    tsx: maskTsx,
    css: maskCss,
  },
  gradient: {
    description: "Swap the gradient geometry without adding a wrapper view.",
    title: "Native gradient surface",
    tsx: gradientTsx,
    css: gradientCss,
  },
} satisfies Record<Feature, { description: string; title: string; tsx: string; css: string }>;

export default function FeaturePlayground({ feature }: { feature: Feature }): React.ReactNode {
  const [codeTab, setCodeTab] = useState<CodeTab>("tsx");
  const [variant, setVariant] = useState(0);
  const [copied, setCopied] = useState(false);
  const content = featureContent[feature];
  const [codeByTab, setCodeByTab] = useState<Record<CodeTab, string>>({
    tsx: content.tsx,
    css: content.css,
  });
  const code = codeByTab[codeTab];
  const variants = feature === "mask" ? ["Aperture", "Soft edge", "Offset"] : ["Aurora", "Sunset", "Ocean"];
  const codeIsEdited = codeByTab.tsx !== content.tsx || codeByTab.css !== content.css;
  const previewStyle = useMemo(() => {
    if (feature === "gradient") {
      return {
        background: codeIsEdited ? gradientFromCode(codeByTab.tsx) ?? variantGradients[variant] : variantGradients[variant],
      };
    }

    return {
      ...(codeIsEdited ? maskFromCode(codeByTab.css) : {
        "--feature-mask-position": ["center", "center", "62% 40%"][variant],
        "--feature-mask-size": ["86%", "104%", "78%"][variant],
      }),
    } as React.CSSProperties;
  }, [codeByTab.css, codeByTab.tsx, codeIsEdited, feature, variant]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <section className="feature-lab" aria-label={`${content.title} playground`}>
      <header className="feature-lab-header">
        <div>
          <span>INTERACTIVE EXAMPLE</span>
          <h3>{content.title}</h3>
          <p>{content.description}</p>
        </div>
        <div className="feature-lab-controls" aria-label="Preview variation">
          {variants.map((label, index) => (
            <button
              aria-pressed={variant === index}
              className={variant === index ? "is-active" : undefined}
              key={label}
              onClick={() => setVariant(index)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="feature-lab-grid">
        <div className="feature-lab-preview">
          <div className={`feature-lab-canvas is-${feature}`} style={previewStyle}>
            {feature === "mask" ? (
              <div className="feature-lab-mask-content">
                <span>Native paint layer</span>
                <strong>Mask motion</strong>
                <i aria-hidden="true" />
              </div>
            ) : (
              <div className="feature-lab-gradient-content">
                <span>Native gradient</span>
                <strong>One className</strong>
              </div>
            )}
          </div>
          <p>{codeIsEdited ? "Preview follows your edited code." : "Click a variation or edit the code to update the preview."}</p>
        </div>
        <div className="feature-lab-code">
          <div className="feature-lab-codebar">
            <div role="tablist" aria-label="Example code">
              {(["tsx", "css"] as const).map((tab) => (
                <button
                  aria-selected={codeTab === tab}
                  className={codeTab === tab ? "is-active" : undefined}
                  key={tab}
                  onClick={() => setCodeTab(tab)}
                  role="tab"
                  type="button"
                >
                  {tab === "tsx" ? "Component.tsx" : "styles.css"}
                </button>
              ))}
            </div>
            <button className="feature-lab-copy" onClick={() => void copy()} type="button">
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
          <CodeMirror
            basicSetup={{ autocompletion: false, foldGutter: false, highlightActiveLineGutter: false }}
            className="feature-lab-editor"
            extensions={[javascript({ jsx: codeTab === "tsx" })]}
            height="281px"
            onChange={(value) => setCodeByTab((current) => ({ ...current, [codeTab]: value }))}
            theme="dark"
            value={code}
          />
        </div>
      </div>
    </section>
  );
}
