---
name: git-conventions
description: Commit message, branch name, and pull-request conventions for this repository. Trigger this skill whenever creating a git commit, naming a branch, or opening/writing a pull request in this repo, so the message/branch/PR follows the required `<icon> <type>: <subject>` format. Full spec in docs/commit-convention.md.
---

## Commit messages

Format: `<icon> <type>: <subject>`

| Icon | Type | Use for |
|------|------|---------|
| ✨ | `feat` | new feature |
| 🐛 | `fix` | bug fix |
| 📝 | `docs` | docs only |
| ♻️ | `refactor` | code change, no behavior change |
| 🔧 | `chore` | tooling, deps, housekeeping |
| ✅ | `test` | tests |
| ⚡ | `perf` | performance |
| 🎨 | `style` | formatting / lint |
| 👷 | `ci` | CI/CD config |
| 📦 | `build` | build system / bundler |
| ⏪ | `revert` | reverts a prior commit |

Rules:
- imperative, lowercase subject, no trailing period, ≤ 72 chars
- one logical change per commit — split unrelated work
- icon must match the type (no `🐛 feat:`)

Example: `✨ feat: add google oauth login`

## Branch names

Format: `<type>/<short-description>` (or `<type>/<scope>/<short-description>` when scoped to one app/package). kebab-case, ≤ 50 chars, no usernames/dates/ticket numbers. Branch from latest `main`; one branch = one PR; never push to `main` directly. Special: `release/<version>`, `hotfix/<desc>`, `revert/<original-branch>`.

## Pull requests

Title = same format as a commit subject (becomes the squash-merge message). Body must include `## Summary`, `## Changes`, `## Testing`, `## Related` sections. Title icon matches the dominant change type; target < 400 lines of diff; squash-merge by default; never invent test results — write `not run` if not run.

## Reference

Full specification: [docs/conventions/commit-convention.md](../../../docs/conventions/commit-convention.md).
