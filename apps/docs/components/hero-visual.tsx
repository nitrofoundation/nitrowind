export default function HeroVisual() {
  return (
    <div className="hero-visual" aria-label="Nitrowind native styling preview">
      <pre className="hero-code">
        <code>
          <span>export function</span> Profile() {'{'}
          {`\n  return (\n    `}
          <b>&lt;View</b>
          {` className="\n      bg-surface dark:bg-slate-950\n      @container p-safe\n    "`}
          <b>&gt;</b>
          {`\n      `}
          <b>&lt;Text</b>
          {` className="text-2xl\n        animate-fade-in"`}
          <b>&gt;</b>
          {`\n        Ship at native speed\n      `}
          <b>&lt;/Text&gt;</b>
          {`\n    `}
          <b>&lt;/View&gt;</b>
          {`\n  );\n`}
          {'}'}
        </code>
      </pre>
      <div className="hero-phone">
        <div className="hero-notch" />
        <span className="hero-phone-top">
          9:41 <i>native</i>
        </span>
        <div className="hero-phone-card">
          <small>COLOR SCHEME</small>
          <strong>Adaptive</strong>
          <em>dark · light · system</em>
        </div>
        <div className="hero-phone-grid">
          <div>
            <small>SAFE AREA</small>
            <b>Ready</b>
          </div>
          <div>
            <small>CONTAINER</small>
            <b>720px</b>
          </div>
        </div>
        <div className="hero-phone-button">
          C++ engine <b>0 re-renders</b>
        </div>
      </div>
    </div>
  );
}
