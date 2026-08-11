import React, { type ReactNode } from "react";
import { ThemeClassNames } from "@docusaurus/theme-common";
import { useDoc } from "@docusaurus/plugin-content-docs/client";
import TOC from "@theme/TOC";

const CoffeeIllustration = () => (
  <svg
    aria-hidden="true"
    className="nitro-support-toc-art"
    viewBox="0 0 96 96"
    fill="none"
  >
    <path d="M34 16c-8 8 8 10 0 20M52 12c-8 9 8 11 0 22" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    <path d="M23 36h48v22c0 15-10 25-24 25S23 73 23 58V36Z" fill="currentColor" opacity=".16" />
    <path d="M23 36h48v22c0 15-10 25-24 25S23 73 23 58V36Z" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" />
    <path d="M71 44h5c10 0 12 16 1 20l-7 3" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    <path d="M25 46h44" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".45" />
    <path d="M32 83h31" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
  </svg>
);

export default function DocItemTOCDesktop(): ReactNode {
  const { toc, frontMatter } = useDoc();

  return (
    <div className="nitro-doc-toc">
      <TOC
        toc={toc}
        minHeadingLevel={frontMatter.toc_min_heading_level}
        maxHeadingLevel={frontMatter.toc_max_heading_level}
        className={ThemeClassNames.docs.docTocDesktop}
      />
      <a
        className="nitro-support-toc-card"
        href="https://buymeacoffee.com/joylan"
        target="_blank"
        rel="noreferrer"
      >
        <CoffeeIllustration />
        <span className="nitro-support-toc-copy">
          <strong>Support NitroWind</strong>
          <span>Help fund native performance, docs, and new features.</span>
        </span>
        <span className="nitro-support-toc-link">Buy me a coffee ↗</span>
      </a>
    </div>
  );
}
