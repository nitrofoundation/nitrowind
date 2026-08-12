import React from "react";
import Link from "@docusaurus/Link";
import { Highlight, themes } from "prism-react-renderer";

const styleSheetCode = `const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f8fafc",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
})

<View style={styles.screen}>
  <Text style={styles.title}>Dashboard</Text>
</View>`;

const nitrowindCode = `<View className="flex-1 bg-surface p-5">
  <View className="@container gap-4">
    <Text className="text-2xl font-bold text-content">
      Dashboard
    </Text>
    <View className="gap-3 @md:flex-row">
      <Metric className="flex-1" />
      <Metric className="flex-1" />
    </View>
  </View>
</View>`;

const comparisonRows = [
  ["Authoring", "JavaScript object literals", "Tailwind className + CSS tokens"],
  ["Themes", "Prop, context, and style recreation", "Compiled native theme dependencies"],
  ["Container queries", "Measure and branch in component code", "@container utilities in className"],
  ["Runtime updates", "React render path", "Targeted ShadowTree style updates"],
  ["Platforms", "Manual Platform branches", "ios:, android:, web: variants"],
];

function CodeSample({ code }: { code: string }): React.ReactNode {
  return (
    <Highlight code={code} language="tsx" theme={themes.vsDark}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={`${className} home-compare-code`} style={style}>
          {tokens.map((line, lineIndex) => (
            <div {...getLineProps({ line })} className="home-compare-code-line" key={lineIndex}>
              <span>{lineIndex + 1}</span>
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
  );
}

export default function HomeComparison(): React.ReactNode {
  return (
    <section className="home-compare-section">
      <div className="seo-home-shell">
        <div className="home-compare-heading">
          <div>
            <p className="seo-home-eyebrow">StyleSheet vs Nitrowind</p>
            <h2>Keep native styles. Remove the manual plumbing.</h2>
          </div>
          <p>
            React Native StyleSheet is the baseline. Nitrowind compiles the
            Tailwind classes you use into native style tables, then tracks the
            theme and container dependencies needed for runtime updates.
          </p>
        </div>

        <div className="home-compare-code-grid">
          <article className="home-compare-pane">
            <header>
              <span>React Native</span>
              <strong>StyleSheet</strong>
            </header>
            <CodeSample code={styleSheetCode} />
          </article>
          <article className="home-compare-pane is-nitrowind">
            <header>
              <span>Nitrowind</span>
              <strong>Compiled className</strong>
            </header>
            <CodeSample code={nitrowindCode} />
          </article>
        </div>

        <div className="home-compare-table" role="table" aria-label="StyleSheet and Nitrowind comparison">
          <div className="home-compare-row is-header" role="row">
            <span role="columnheader">Capability</span>
            <span role="columnheader">StyleSheet</span>
            <span role="columnheader">Nitrowind</span>
          </div>
          {comparisonRows.map(([capability, styleSheet, nitrowind]) => (
            <div className="home-compare-row" key={capability} role="row">
              <strong role="cell">{capability}</strong>
              <span role="cell">{styleSheet}</span>
              <span role="cell">{nitrowind}</span>
            </div>
          ))}
        </div>

        <div className="home-compare-note">
          <p>
            Performance numbers depend on the device, build mode, React Native
            version, and launch state. Nitrowind includes a matched 1,000-card,
            10-run benchmark so results can be reproduced honestly.
          </p>
          <Link to="https://github.com/nitrofoundation/nitrowind/tree/main/benchmarks">
            Read the benchmark methodology
          </Link>
        </div>
      </div>
    </section>
  );
}
