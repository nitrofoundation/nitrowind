import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const workspacePath = process.env.RELEASE_IT_WORKSPACES_PATH_TO_WORKSPACE;

if (!workspacePath) {
  throw new Error("release-it did not provide a workspace path for publishing.");
}

const workspaceDirectory = resolve(repositoryRoot, workspacePath);
if (relative(repositoryRoot, workspaceDirectory).startsWith("..")) {
  throw new Error(`Refusing to publish a workspace outside this repository: ${workspacePath}`);
}

const manifest = JSON.parse(
  await readFile(resolve(workspaceDirectory, "package.json"), "utf8"),
);

if (manifest.private) {
  process.exit(0);
}

const arguments_ = [
  "workspace",
  manifest.name,
  "npm",
  "publish",
  "--access",
  process.env.RELEASE_IT_WORKSPACES_ACCESS || "public",
  "--tag",
  process.env.RELEASE_IT_WORKSPACES_TAG || "latest",
];

if (process.env.RELEASE_IT_WORKSPACES_DRY_RUN === "true") {
  arguments_.push("--dry-run");
}

execFileSync("yarn", arguments_, {
  cwd: repositoryRoot,
  env: process.env,
  stdio: "inherit",
});
