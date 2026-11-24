#!/usr/bin/env node
// Cuts a release: moves the [Unreleased] section of CHANGELOG.md to [x.y.z] - <today>,
// opens a fresh [Unreleased], fixes the compare links, commits and tags vx.y.z.
//
//   pnpm release 0.3.0            commit and tag locally
//   pnpm release 0.3.0 --push     also push main and the tag, and create the GitHub release (needs gh)
//   pnpm release 0.3.0 --dry-run  print the new changelog section, change nothing

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SEMVER = /^\d+\.\d+\.\d+$/;
const UNRELEASED_LINK = /^\[Unreleased\]: (\S+)\/compare\/(v[^.\s]\S*)\.\.\.HEAD$/m;

/** The body of the [Unreleased] section (between its heading and the next "## ["), trimmed. */
export function unreleasedBody(changelog) {
  const start = changelog.indexOf("## [Unreleased]");
  if (start === -1) throw new Error("CHANGELOG.md has no ## [Unreleased] heading.");
  const bodyStart = changelog.indexOf("\n", start) + 1;
  const next = changelog.indexOf("\n## [", bodyStart);
  return changelog.slice(bodyStart, next === -1 ? undefined : next).trim();
}

/** Compares two x.y.z versions numerically. */
export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** Returns the changelog with [Unreleased] released as `version` on `date` (YYYY-MM-DD). */
export function cutRelease(changelog, version, date) {
  if (!SEMVER.test(version)) throw new Error(`"${version}" is not a version like 1.2.3.`);
  if (!unreleasedBody(changelog).includes("- ")) {
    throw new Error("[Unreleased] has no entries. Nothing to release.");
  }
  if (changelog.includes(`## [${version}]`)) throw new Error(`${version} is already in CHANGELOG.md.`);

  const link = changelog.match(UNRELEASED_LINK);
  if (!link) throw new Error("CHANGELOG.md has no [Unreleased]: <repo>/compare/vX...HEAD link.");
  const [line, repo, previousTag] = link;
  if (compareVersions(version, previousTag.slice(1)) <= 0) {
    throw new Error(`${version} must be higher than the last release ${previousTag.slice(1)}.`);
  }

  return changelog
    .replace("## [Unreleased]", `## [Unreleased]\n\n## [${version}] - ${date}`)
    .replace(
      line,
      `[Unreleased]: ${repo}/compare/v${version}...HEAD\n[${version}]: ${repo}/compare/${previousTag}...v${version}`,
    );
}

/** Today's date in local time as YYYY-MM-DD. */
export function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const [version] = argv.filter((a) => !a.startsWith("--"));
  const dryRun = flags.has("--dry-run");
  const push = flags.has("--push");
  if (!version) throw new Error("Usage: pnpm release <x.y.z> [--push] [--dry-run]");

  const root = git("rev-parse", "--show-toplevel");
  const path = `${root}/CHANGELOG.md`;
  const before = readFileSync(path, "utf8");
  const after = cutRelease(before, version, today());
  const notes = unreleasedBody(before);

  if (dryRun) {
    console.log(`Would release ${version} with these notes:\n\n${notes}`);
    return;
  }

  if (git("branch", "--show-current") !== "main") throw new Error("Release from main only.");
  if (git("status", "--porcelain") !== "") throw new Error("The working tree is not clean.");
  git("fetch", "origin", "main", "--tags");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    throw new Error("main is not level with origin/main. Pull or push first.");
  }
  if (git("tag", "--list", `v${version}`) !== "") throw new Error(`Tag v${version} already exists.`);

  writeFileSync(path, after);
  git("add", "CHANGELOG.md");
  git("commit", "-m", `chore: release ${version}`);
  git("tag", "-a", `v${version}`, "-m", `v${version}`);
  console.log(`Committed and tagged v${version}.`);

  if (!push) {
    console.log(`Push with: git push origin main v${version}`);
    return;
  }
  execFileSync("git", ["push", "origin", "main", `v${version}`], { stdio: "inherit" });
  execFileSync("gh", ["release", "create", `v${version}`, "--title", `v${version}`, "--notes", notes], {
    stdio: "inherit",
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
