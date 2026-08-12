import React, { useMemo, useState } from "react";
import { Highlight, themes } from "prism-react-renderer";

const jsxCode = `export function Dashboard() {
  return (
    <View className="flex-1 bg-surface p-safe">
      <View className="@container gap-4 p-5">
        <Text className="text-2xl font-bold text-content">
          Ship at native speed
        </Text>
        <View className="gap-3 @md:flex-row">
          <Metric className="flex-1 bg-primary" />
          <Metric className="flex-1 bg-accent" />
        </View>
      </View>
    </View>
  )
}`;

const cssCode = `@import "tailwindcss";
@import "@nitrofoundation/nitrowind";

@theme {
  --color-primary: #0f766e;
  --color-accent: #f97316;
  --color-surface: #f8fafc;
  --color-content: #10212e;
}

@variant adaptive (&:where(.adaptive, .adaptive *));`;

type PreviewTheme = "light" | "dark" | "adaptive";
type PreviewSize = "phone" | "tablet";
type CodeTab = "jsx" | "css";

export default function HomePlayground(): React.ReactNode {
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("adaptive");
  const [previewSize, setPreviewSize] = useState<PreviewSize>("tablet");
  const [codeTab, setCodeTab] = useState<CodeTab>("jsx");
  const [copied, setCopied] = useState(false);

  const code = codeTab === "jsx" ? jsxCode : cssCode;
  const language = codeTab === "jsx" ? "tsx" : "css";
  const modeLabel = previewTheme === "adaptive" ? "System 18:42" : `${previewTheme[0].toUpperCase()}${previewTheme.slice(1)} mode`;

  const copyCode = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const previewCards = useMemo(
    () => [
      { label: "Native updates", value: "0 rerenders", tone: "primary" },
      { label: "Container", value: previewSize === "tablet" ? "768 px" : "390 px", tone: "accent" },
      { label: "Theme", value: previewTheme === "adaptive" ? "Adaptive" : modeLabel, tone: "neutral" },
    ],
    [modeLabel, previewSize, previewTheme],
  );

  return (
    <div
      className="home-lab"
      data-preview-size={previewSize}
      data-preview-theme={previewTheme}
    >
      <div className="home-lab-toolbar">
        <div className="home-lab-status">
          <span aria-hidden="true" />
          Live native preview
        </div>
        <div className="home-lab-controls" aria-label="Preview controls">
          <div className="home-lab-segment" aria-label="Theme mode">
            {(["light", "dark", "adaptive"] as const).map((theme) => (
              <button
                aria-pressed={previewTheme === theme}
                className={previewTheme === theme ? "is-active" : undefined}
                key={theme}
                onClick={() => setPreviewTheme(theme)}
                type="button"
              >
                {theme[0].toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
          <div className="home-lab-segment" aria-label="Container size">
            {(["phone", "tablet"] as const).map((size) => (
              <button
                aria-pressed={previewSize === size}
                className={previewSize === size ? "is-active" : undefined}
                key={size}
                onClick={() => setPreviewSize(size)}
                type="button"
              >
                {size[0].toUpperCase() + size.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="home-lab-workspace">
        <div className="home-code-panel">
          <div className="home-code-tabs">
            <div role="tablist" aria-label="Code example">
              <button
                aria-selected={codeTab === "jsx"}
                className={codeTab === "jsx" ? "is-active" : undefined}
                onClick={() => setCodeTab("jsx")}
                role="tab"
                type="button"
              >
                Dashboard.tsx
              </button>
              <button
                aria-selected={codeTab === "css"}
                className={codeTab === "css" ? "is-active" : undefined}
                onClick={() => setCodeTab("css")}
                role="tab"
                type="button"
              >
                global.css
              </button>
            </div>
            <button className="home-copy-button" onClick={copyCode} type="button">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <Highlight code={code} language={language} theme={themes.vsDark}>
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
              <pre className={`${className} home-code`} style={style}>
                {tokens.map((line, lineIndex) => (
                  <div {...getLineProps({ line })} className="home-code-line" key={lineIndex}>
                    <span className="home-code-number">{lineIndex + 1}</span>
                    <span>
                      {line.map((token, tokenIndex) => (
                        <span key={tokenIndex} {...getTokenProps({ token })} />
                      ))}
                    </span>
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
          <div className="home-code-runtime">
            <span>Nitrowind engine</span>
            <strong>Compiled in 2.8 ms</strong>
          </div>
        </div>

        <div className="home-preview-stage">
          <div className="home-device">
            <div className="home-device-status">
              <span>9:41</span>
              <span>{modeLabel}</span>
            </div>
            <div className="home-preview-app">
              <div className="home-preview-heading">
                <div>
                  <span className="home-preview-kicker">NITROWIND RUNTIME</span>
                  <h2>Ship at native speed.</h2>
                </div>
                <span className="home-preview-avatar">NW</span>
              </div>
              <div className="home-preview-progress">
                <div>
                  <span>Style pipeline</span>
                  <strong>Ready</strong>
                </div>
                <span className="home-preview-track"><span /></span>
              </div>
              <div className="home-preview-grid">
                {previewCards.map((card) => (
                  <div className={`home-preview-metric is-${card.tone}`} key={card.label}>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                  </div>
                ))}
              </div>
              <div className="home-preview-footer">
                <span className="home-preview-pulse" aria-hidden="true" />
                Native theme state is synchronized
              </div>
            </div>
          </div>
          <p className="home-preview-caption">
            Resize the container or change the theme. The same className adapts.
          </p>
        </div>
      </div>
    </div>
  );
}
