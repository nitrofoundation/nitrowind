'use client';

import { useState } from 'react';

const workflows = [
  ['nitrowind-setup', 'Setup'],
  ['nitrowind-migration', 'Migration'],
  ['nitrowind-theming', 'Adaptive theming'],
  ['nitrowind-animations', 'Animations'],
] as const;

export default function SkillsBuilder() {
  const [workflow, setWorkflow] = useState<(typeof workflows)[number][0]>(workflows[0][0]);
  const name = workflow;
  const content = `---\nname: ${name}\ndescription: Use this skill for Nitrowind ${workflow.replace('nitrowind-', '')}.\n---\n\n# ${name}\n\nFollow the linked Nitrowind documentation and validate the native result.`;
  return (
    <section className="my-8 rounded-xl border border-fd-border bg-fd-card p-5">
      <label className="mb-2 block text-sm font-medium" htmlFor="workflow">
        Nitrowind workflow
      </label>
      <select
        className="w-full rounded-md border border-fd-border bg-fd-background p-2"
        id="workflow"
        onChange={event => setWorkflow(event.target.value as typeof workflow)}
        value={workflow}
      >
        {workflows.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <pre className="mt-4 overflow-auto rounded-lg bg-zinc-950 p-4 text-sm text-zinc-100">
        <code>{content}</code>
      </pre>
    </section>
  );
}
