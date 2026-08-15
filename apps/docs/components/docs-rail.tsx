import CoffeeSupportCard from './coffee-support-card';

export default function DocsRail() {
  return (
    <div className="docs-rail">
      {/* <div className="docs-rail-card">
        <span>PAGE TOOLS</span>
        <a href={editUrl} rel="noreferrer" target="_blank">
          Edit on GitHub <b>↗</b>
        </a>
        <a href={markdownUrl}>
          Open Markdown <b>→</b>
        </a>
      </div> */}
      {/* <div className="docs-rail-card docs-rail-runtime">
        <span>NATIVE FIRST</span>
        <strong>Runtime-dependent styles update below React.</strong>
        <small>
          Theme, dimensions, safe area, group state, and containers can update without a React
          re-render.
        </small>
      </div> */}
      <CoffeeSupportCard />
    </div>
  );
}
