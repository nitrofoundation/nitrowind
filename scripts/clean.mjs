import { existsSync, lstatSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");

/**
 * Generated files and directories owned by this repository. Keep this list
 * explicit: source directories such as apps/docs/lib must never be removed.
 */
const generatedTargets = [
  ".turbo",
  "coverage",
  "output",
  ".yarn/cache",
  ".yarn/install-state.gz",
  ".pnp.cjs",
  ".pnp.loader.mjs",
  "nitrogen/generated",
  "packages/nitrocss/lib",
  "packages/nitrocss/android/.gradle",
  "packages/nitrocss/android/.cxx",
  "packages/nitrocss/android/build",
  "packages/nitrocss/android/app/.cxx",
  "packages/nitrocss/android/app/build",
  "packages/nitrocss/ios/Pods",
  "packages/nitrocss/ios/build",
  "packages/nitrowind/lib",
  "packages/nitrowind-skills/lib",
  "packages/nitrowind-skills/dist",
  "apps/docs/.next",
  "apps/docs/out",
  "apps/docs/coverage",
  "apps/nitrowind-docs/build",
  "apps/nitrowind-docs/.docusaurus",
  "apps/nitrowind-docs/coverage",
  "apps/example/dist-web",
  "apps/example/web-build",
  "apps/example/coverage",
  "apps/example/.expo",
  "apps/example/.expo-shared",
  "apps/example/android/.gradle",
  "apps/example/android/.cxx",
  "apps/example/android/build",
  "apps/example/android/app/.cxx",
  "apps/example/android/app/build",
  "apps/example/ios/Pods",
  "apps/example/ios/build",
  "apps/expo-web-example/dist",
  "apps/expo-web-example/web-build",
  "apps/expo-web-example/.expo",
  "apps/expo-web-example/.expo-shared",
  "apps/expo-web-example/coverage",
  "apps/nextjs-example/.next",
  "apps/nextjs-example/out",
  "apps/nextjs-example/coverage",
  "apps/vite-example/dist",
  "apps/vite-example/coverage",
];

for (const workspaceRoot of ["apps", "packages"]) {
  const absoluteWorkspaceRoot = join(repoRoot, workspaceRoot);
  if (!existsSync(absoluteWorkspaceRoot)) continue;

  for (const entry of readdirSync(absoluteWorkspaceRoot)) {
    const absoluteEntry = join(absoluteWorkspaceRoot, entry);
    if (statSync(absoluteEntry).isDirectory()) {
      generatedTargets.push(join(workspaceRoot, entry, "node_modules"));
    }
  }
}

generatedTargets.push("node_modules");

function remove(target) {
  const absoluteTarget = join(repoRoot, target);
  if (!existsSync(absoluteTarget)) return;

  console.log(`${dryRun ? "would remove" : "removed"} ${target}`);
  if (!dryRun) {
    rmSync(absoluteTarget, { force: true, recursive: true });
  }
}

function removeTypeScriptBuildInfo(directory) {
  if (!existsSync(directory)) return;

  for (const entry of readdirSync(directory)) {
    if (
      [
        ".cxx",
        ".git",
        ".gradle",
        ".next",
        "android",
        "build",
        "dist",
        "dist-web",
        "ios",
        "node_modules",
        "Pods",
      ].includes(entry)
    ) {
      continue;
    }

    const absoluteEntry = join(directory, entry);
    let entryStats;
    try {
      entryStats = lstatSync(absoluteEntry);
    } catch {
      // A concurrently removed cache entry or a dangling build symlink.
      continue;
    }
    if (entryStats.isSymbolicLink()) continue;
    if (entryStats.isDirectory()) {
      removeTypeScriptBuildInfo(absoluteEntry);
    } else if (entry.endsWith(".tsbuildinfo")) {
      const relativePath = absoluteEntry.slice(repoRoot.length + 1);
      console.log(`${dryRun ? "would remove" : "removed"} ${relativePath}`);
      if (!dryRun) rmSync(absoluteEntry, { force: true });
    }
  }
}

for (const target of generatedTargets) remove(target);
for (const workspaceRoot of ["apps", "packages"]) {
  removeTypeScriptBuildInfo(join(repoRoot, workspaceRoot));
}

console.log(dryRun ? "Clean preview complete." : "Repository clean complete.");
