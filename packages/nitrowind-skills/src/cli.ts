#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  normalizeSkillName,
  renderOpenAiMetadata,
  renderSkill,
  skillById,
  skillCatalog,
} from "./catalog.js";

type ParsedArgs = {
  command?: string;
  targetPath: string;
  skill?: string;
  all: boolean;
};

const help = `Nitrowind skills

Usage:
  nitrowind-skills list
  nitrowind-skills add <skill-name> [--path .agents/skills]
  nitrowind-skills add --all [--path .agents/skills]
  nitrowind-skills create [--path .agents/skills]

Run \"nitrowind-skills list\" to see the shipped skills.`;

const parseArgs = (args: string[]): ParsedArgs => {
  const command = args[0];
  let targetPath = ".agents/skills";
  let skill: string | undefined;
  let all = false;

  for (let index = 1; index < args.length; index += 1) {
    const value = args[index];
    if (!value) continue;
    if (value === "--all") all = true;
    else if (value === "--path") {
      const next = args[index + 1];
      if (!next) throw new Error("--path requires a directory.");
      targetPath = next;
      index += 1;
    } else if (!value.startsWith("-") && !skill) {
      skill = value;
    }
  }

  return { command, targetPath, skill, all };
};

const writeSkill = async (targetPath: string, definition: (typeof skillCatalog)[number]) => {
  const destination = resolve(targetPath, definition.id);
  await mkdir(resolve(destination, "agents"), { recursive: true });
  await writeFile(resolve(destination, "SKILL.md"), renderSkill(definition), "utf8");
  await writeFile(
    resolve(destination, "agents", "openai.yaml"),
    renderOpenAiMetadata(definition),
    "utf8",
  );
  return destination;
};

const chooseSkill = async () => {
  const readline = createInterface({ input: stdin, output: stdout });
  try {
    stdout.write("\nAvailable Nitrowind skills:\n");
    skillCatalog.forEach((skill, index) => {
      stdout.write(`  ${index + 1}. ${skill.id} - ${skill.summary}\n`);
    });
    const selected = await readline.question("\nChoose a feature number: ");
    const feature = skillCatalog[Number(selected) - 1];
    if (!feature) throw new Error("Choose one of the numbered skills.");
    const requestedName = await readline.question(`Skill name [${feature.id}]: `);
    const requestedDescription = await readline.question(
      "What should this skill help with? Press enter to use the curated description: ",
    );
    const requestedPath = await readline.question(
      "Install folder [.agents/skills]: ",
    );

    const name = normalizeSkillName(requestedName) || feature.id;
    const definition = {
      ...feature,
      id: name,
      title: name === feature.id ? feature.title : name.replace(/-/g, " "),
      summary: requestedDescription.trim() || feature.summary,
    };
    return { definition, targetPath: requestedPath.trim() || ".agents/skills" };
  } finally {
    readline.close();
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === "help" || args.command === "--help") {
    stdout.write(`${help}\n`);
    return;
  }

  if (args.command === "list") {
    skillCatalog.forEach((skill) => stdout.write(`${skill.id}\t${skill.summary}\n`));
    return;
  }

  if (args.command === "create") {
    if (!stdin.isTTY) throw new Error("create needs an interactive terminal.");
    const { definition, targetPath } = await chooseSkill();
    const destination = await writeSkill(targetPath, definition);
    stdout.write(`Created ${definition.id} at ${destination}\n`);
    return;
  }

  if (args.command === "add") {
    const definitions = args.all
      ? skillCatalog
      : args.skill
        ? [skillById(args.skill)]
        : [];
    if (definitions.length === 0 || definitions.some((skill) => !skill)) {
      throw new Error("Choose a shipped skill name or use --all.");
    }
    const destinations = await Promise.all(
      definitions.map((skill) => writeSkill(args.targetPath, skill!)),
    );
    stdout.write(`Installed ${destinations.length} skill${destinations.length === 1 ? "" : "s"}:\n`);
    destinations.forEach((destination) => stdout.write(`  ${destination}\n`));
    return;
  }

  throw new Error(`Unknown command: ${args.command}`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`nitrowind-skills: ${message}\n`);
  process.exitCode = 1;
});
