import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderOpenAiMetadata, renderSkill, skillCatalog } from "./catalog.js";

const outputRoot = resolve(process.argv[2] ?? ".", "skills");

await Promise.all(
  skillCatalog.map(async (skill) => {
    const skillPath = resolve(outputRoot, skill.id);
    await mkdir(resolve(skillPath, "agents"), { recursive: true });
    await writeFile(resolve(skillPath, "SKILL.md"), renderSkill(skill), "utf8");
    await writeFile(
      resolve(skillPath, "agents", "openai.yaml"),
      renderOpenAiMetadata(skill),
      "utf8",
    );
  }),
);

process.stdout.write(`Generated ${skillCatalog.length} skills in ${outputRoot}\n`);
