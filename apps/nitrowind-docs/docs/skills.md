---
id: skills
title: Skills
slug: /skills
description: Install or tailor reusable agent skills for supported Nitrowind workflows.
hide_title: true
---

import SkillsBuilder from "@site/src/components/SkillsBuilder";

<div className="docs-hero">
  <span className="docs-eyebrow">For AI agents</span>
  <h1>Nitrowind Skills</h1>
  <p>
    Give an agent focused, up-to-date workflows for the parts of Nitrowind that
    benefit from careful native React Native decisions: setup, theming, container
    layouts, background images, effects, animations, SVG, and component interop.
  </p>
  <div className="docs-actions">
    <a className="docs-action docs-action-primary" href="#skill-builder">Build a skill</a>
    <code>npx @nitrofoundation/nitrowind-skills add --all</code>
  </div>
</div>

## Install curated skills

Install every shipped skill into your current project's `.agents/skills` folder:

```bash
npx @nitrofoundation/nitrowind-skills add --all
```

Or choose a focused workflow:

```bash
npx @nitrofoundation/nitrowind-skills add nitrowind-background-images
```

Each skill points to these canonical docs instead of copying the full reference into an agent's context. Use the builder below to create a tailored starting point for your own project.

<SkillsBuilder />

## What gets generated

A skill is a small folder containing `SKILL.md` plus optional agent-facing metadata. Keep it near your project at `.agents/skills/<skill-name>/SKILL.md`, commit it with the project when it describes shared engineering practice, and update it whenever the underlying workflow changes.

The curated set covers every documented feature area: component interop, interaction states, responsive and container layouts, safe area, background images, gradients and native effects, animations, SVG, native props, and the C++ runtime engine. It also includes setup, migration, plain CSS, and adaptive theming.
