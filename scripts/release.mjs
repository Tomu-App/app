#!/usr/bin/env node
// Cuts a release: moves the [Unreleased] section of CHANGELOG.md to [x.y.z] - <today>,
// opens a fresh [Unreleased], fixes the compare links, commits and tags vx.y.z.
//
//   pnpm release 0.3.0 --dry-run  run every check and print the notes, change nothing
//   pnpm release 0.3.0            commit and tag locally
//   pnpm release 0.3.0 --push     also push main and the tag atomically and create the GitHub release (needs gh)
//
// Every check runs before anything changes. If a later step fails, the script undoes its own
// local changes (changelog edit, release commit, tag) and says exactly what state is left.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER = /^\d+\.\d+\.\d+$/;
const UNRELEASED_LINK = /^\[Unreleased\]: (\S+)\/compare\/v(\d+\.\d+\.\d+)\.\.\.HEAD$/m;
const FLAGS = new Set(["--dry-run", "--push"]);
const USAGE = "Usage: pnpm release <x.y.z> [--dry-run] [--push]";

/** An expected failure: the message is shown as is, without a stack trace. */
export class ReleaseError extends Error {}

/** Parses the command line. Unknown flags are refused, so a typo never cuts a real release. */
export function parseArgs(argv) {
  const flags = argv.filter((a) => a.startsWith("-"));
  const positional = argv.filter((a) => !a.startsWith("-"));
  const unknown = flags.filter((f) => !FLAGS.has(f));
  if (unknown.length > 0) throw new ReleaseError(`Unknown option ${unknown.join(", ")}.\n${USAGE}`);
  if (positional.length !== 1) throw new ReleaseError(`Give exactly one version.\n${USAGE}`);
  const [version] = positional;
  if (!SEMVER.test(version)) throw new ReleaseError(`"${version}" is not a version like 1.2.3 (no "v").`);
  if (flags.includes("--dry-run") && flags.includes("--push")) {
    throw new ReleaseError("--dry-run and --push do not go together.");
  }
  return { version, dryRun: flags.includes("--dry-run"), push: flags.includes("--push") };
}

/** The body of the [Unreleased] section (between its heading and the next "## ["), trimmed. */
export function unreleasedBody(changelog) {
  const start = changelog.indexOf("## [Unreleased]");
  if (start === -1) throw new ReleaseError("CHANGELOG.md has no ## [Unreleased] heading.");
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

/** Returns the changelog with [Unreleased] released as `version` on `date` (YYYY-MM-DD). Keeps CRLF files CRLF. */
export function cutRelease(changelog, version, date) {
  const eol = changelog.includes("\r\n") ? "\r\n" : "\n";
  const text = changelog.replace(/\r\n/g, "\n");

  if (!SEMVER.test(version)) throw new ReleaseError(`"${version}" is not a version like 1.2.3.`);
  if (!/^\s*[-*] /m.test(unreleasedBody(text))) {
    throw new ReleaseError("[Unreleased] has no entries. Nothing to release.");
  }
  if (text.includes(`## [${version}]`)) throw new ReleaseError(`${version} is already in CHANGELOG.md.`);
  if ((text.match(/^## \[Unreleased\]/gm) ?? []).length !== 1) {
    throw new ReleaseError("CHANGELOG.md must have exactly one ## [Unreleased] heading.");
  }

  const link = text.match(UNRELEASED_LINK);
  if (!link) {
    throw new ReleaseError(
      "CHANGELOG.md has no link like [Unreleased]: <repo>/compare/v1.2.3...HEAD at the bottom.",
    );
  }
  const [line, repo, previous] = link;
  if (compareVersions(version, previous) <= 0) {
    throw new ReleaseError(`${version} must be higher than the last release ${previous}.`);
  }

  const out = text
    .replace("## [Unreleased]", `## [Unreleased]\n\n## [${version}] - ${date}`)
    .replace(
      line,
      `[Unreleased]: ${repo}/compare/v${version}...HEAD\n[${version}]: ${repo}/compare/v${previous}...v${version}`,
    );
  return eol === "\n" ? out : out.replace(/\n/g, eol);
}

/** Today's date in local time as YYYY-MM-DD. */
export function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Runs a command and returns its stdout without trailing whitespace. A failure becomes a ReleaseError carrying the command's own output. */
function run(cmd, args, cwd, { inherit = false } = {}) {
  try {
    const out = execFileSync(cmd, args, {
      cwd,
      encoding: "utf8",
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    return (out ?? "").trimEnd();
  } catch (error) {
    if (error.code === "ENOENT") throw new ReleaseError(`"${cmd}" is not installed or not on PATH.`);
    const detail = [error.stderr, error.stdout].filter(Boolean).join("\n").trim();
    throw new ReleaseError(`\`${cmd} ${args.join(" ")}\` failed${detail ? `:\n${detail}` : "."}`);
  }
}

/** Every check that can fail without side effects. Returns what the release needs. */
function preflight({ version, push }, cwd, date) {
  const root = run("git", ["rev-parse", "--show-toplevel"], cwd);
  const git = (...args) => run("git", args, root);

  const path = join(root, "CHANGELOG.md");
  let before;
  try {
    before = readFileSync(path, "utf8");
  } catch (error) {
    throw new ReleaseError(`Cannot read ${path}: ${error.message}`);
  }
  const after = cutRelease(before, version, date);
  const notes = unreleasedBody(before.replace(/\r\n/g, "\n"));

  const problems = [];
  const branch = git("branch", "--show-current");
  if (branch !== "main")
    problems.push(`You are on "${branch || "a detached HEAD"}". Release from main only.`);
  const dirty = git("status", "--porcelain");
  if (dirty !== "") problems.push(`The working tree is not clean:\n${dirty}`);
  try {
    git("fetch", "origin", "main", "--tags");
  } catch (error) {
    throw new ReleaseError(`Cannot reach origin to check main and the tags.\n${error.message}`);
  }
  if (branch === "main" && git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    problems.push("main is not level with origin/main. Pull or push first.");
  }
  if (git("tag", "--list", `v${version}`) !== "") problems.push(`Tag v${version} already exists.`);
  if (push) {
    try {
      run("gh", ["auth", "status"], root);
    } catch (error) {
      problems.push(`--push needs a logged-in GitHub CLI (run \`gh auth login\`).\n${error.message}`);
    }
  }
  if (problems.length > 0) throw new ReleaseError(`Not releasing:\n- ${problems.join("\n- ")}`);

  return { root, path, before, after, notes, git };
}

/** Releases `version`. `cwd` is any directory inside the repo; `log` receives progress lines. */
export function release(argv, { cwd = process.cwd(), date = today(), log = console.log } = {}) {
  const options = parseArgs(argv);
  const { version, dryRun, push } = options;
  const { path, before, after, notes, git, root } = preflight(options, cwd, date);
  const tag = `v${version}`;

  if (dryRun) {
    log(`All checks passed. Would release ${version} (${date}) with these notes:\n\n${notes}`);
    return;
  }

  // Local steps: undone in reverse order if any of them fails.
  const undo = [];
  try {
    writeFileSync(path, after);
    undo.push(() => writeFileSync(path, before));
    git("add", "CHANGELOG.md");
    undo.push(() => git("reset", "--quiet", "--", "CHANGELOG.md"));
    git("commit", "--quiet", "-m", `chore: release ${version}`);
    undo.push(() => git("reset", "--quiet", "--soft", "HEAD~1"));
    git("tag", "-a", tag, "-m", tag);
    undo.push(() => git("tag", "-d", tag));
  } catch (error) {
    const failedUndo = [];
    for (const step of undo.reverse()) {
      try {
        step();
      } catch (undoError) {
        failedUndo.push(undoError.message);
      }
    }
    if (failedUndo.length > 0) {
      throw new ReleaseError(
        `${error.message}\n\nUndoing the local changes also failed, check \`git status\`, \`git log -1\` and \`git tag -l ${tag}\` by hand:\n${failedUndo.join("\n")}`,
      );
    }
    throw new ReleaseError(
      `${error.message}\n\nNothing was released. The changelog, commit and tag were undone.`,
    );
  }
  log(`Committed "chore: release ${version}" and tagged ${tag}.`);

  if (!push) {
    log(`Push with: git push --atomic origin main ${tag}`);
    return;
  }

  // Remote steps: never undone automatically, since others may already see them.
  try {
    run("git", ["push", "--atomic", "origin", "main", tag], root, { inherit: true });
  } catch (error) {
    throw new ReleaseError(
      `${error.message}\n\nThe push was atomic, so origin is unchanged. The release commit and ${tag} exist locally.\nRetry: git push --atomic origin main ${tag}\nUndo:  git tag -d ${tag} && git reset --hard HEAD~1`,
    );
  }
  log(`Pushed main and ${tag}.`);

  try {
    run("gh", ["release", "create", tag, "--title", tag, "--notes", notes, "--verify-tag"], root);
  } catch (error) {
    const notesFile = join(tmpdir(), `tomu-release-${tag}.md`);
    let retry = `gh release create ${tag} --title ${tag} --notes-file ${notesFile} --verify-tag`;
    try {
      writeFileSync(notesFile, notes);
    } catch {
      retry = `gh release create ${tag} --title ${tag} --verify-tag  (paste the ${version} section of CHANGELOG.md as notes)`;
    }
    throw new ReleaseError(
      `${error.message}\n\n${tag} is pushed, only the GitHub release is missing.\nRetry: ${retry}`,
    );
  }
  log(`Created the GitHub release ${tag}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    release(process.argv.slice(2));
  } catch (error) {
    if (error instanceof ReleaseError) {
      console.error(`release: ${error.message}`);
    } else {
      console.error("release: unexpected error, nothing is guaranteed to be undone. Check `git status`.");
      console.error(error);
    }
    process.exit(1);
  }
}
