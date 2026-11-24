import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  ReleaseError,
  compareVersions,
  cutRelease,
  parseArgs,
  release,
  today,
  unreleasedBody,
} from "./release.mjs";

const REPO = "https://github.com/Tomu-App/app";
const LOG = `# Changelog

Intro.

## [Unreleased]

### Added

- New thing.

## [0.1.0] - 2026-11-08

### Added

- First.

[Unreleased]: ${REPO}/compare/v0.1.0...HEAD
[0.1.0]: ${REPO}/releases/tag/v0.1.0
`;

describe("cutRelease", () => {
  test("moves [Unreleased] under the new version and opens a fresh one", () => {
    const out = cutRelease(LOG, "0.2.0", "2026-11-25");
    assert.match(out, /## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-11-25\n\n### Added\n\n- New thing\./);
    assert.equal(unreleasedBody(out), "");
    assert.match(out, /^\[Unreleased\]: .+\/compare\/v0\.2\.0\.\.\.HEAD$/m);
    assert.match(out, /^\[0\.2\.0\]: .+\/compare\/v0\.1\.0\.\.\.v0\.2\.0$/m);
    assert.match(out, /^\[0\.1\.0\]: .+\/releases\/tag\/v0\.1\.0$/m);
  });

  test("keeps a CRLF file CRLF", () => {
    const out = cutRelease(LOG.replace(/\n/g, "\r\n"), "0.2.0", "2026-11-25");
    assert.equal(out.replace(/\r\n/g, "").includes("\n"), false);
    assert.match(out, /\[0\.2\.0\]: .+v0\.2\.0\r\n/);
  });

  test("refuses an empty [Unreleased], an existing or lower version and a missing link", () => {
    const empty = cutRelease(LOG, "0.2.0", "2026-11-25");
    assert.throws(() => cutRelease(empty, "0.3.0", "2026-11-26"), /no entries/);
    assert.throws(() => cutRelease(LOG, "0.1.0", "2026-11-25"), /already in/);
    assert.throws(() => cutRelease(LOG, "0.0.9", "2026-11-25"), /must be higher/);
    assert.throws(() => cutRelease(LOG.replace(/^\[Unreleased\]:.*$/m, ""), "0.2.0", "x"), /no link/);
    assert.throws(() => cutRelease("# Changelog\n", "0.2.0", "x"), /no ## \[Unreleased\]/);
  });

  test("all its errors are ReleaseErrors", () => {
    assert.throws(() => cutRelease(LOG, "0.0.9", "x"), ReleaseError);
  });
});

describe("parseArgs", () => {
  test("accepts a version with known flags", () => {
    assert.deepEqual(parseArgs(["1.2.3", "--push"]), { version: "1.2.3", dryRun: false, push: true });
  });

  test("refuses typos, missing or extra versions, a v prefix and conflicting flags", () => {
    assert.throws(() => parseArgs(["1.2.3", "--dryrun"]), /Unknown option --dryrun/);
    assert.throws(() => parseArgs(["1.2.3", "-n"]), /Unknown option -n/);
    assert.throws(() => parseArgs([]), /exactly one version/);
    assert.throws(() => parseArgs(["1.2.3", "1.2.4"]), /exactly one version/);
    assert.throws(() => parseArgs(["v1.2.3"]), /not a version/);
    assert.throws(() => parseArgs(["1.2.3", "--dry-run", "--push"]), /do not go together/);
  });
});

test("compareVersions compares numerically", () => {
  assert.ok(compareVersions("0.10.0", "0.9.0") > 0);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
});

test("today formats local dates", () => {
  assert.equal(today(new Date(2026, 0, 5)), "2026-01-05");
});

describe("release in a real git repo", () => {
  let dir;
  let repo;
  let hooks;
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  const quiet = { date: "2026-11-25", log: () => {} };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tomu-release-test-"));
    const origin = join(dir, "origin.git");
    repo = join(dir, "work");
    hooks = join(dir, "hooks");
    mkdirSync(hooks);
    execFileSync("git", ["init", "--quiet", "--bare", "--initial-branch=main", origin]);
    execFileSync("git", ["init", "--quiet", "--initial-branch=main", repo]);
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    git("config", "commit.gpgsign", "false");
    git("config", "tag.gpgsign", "false");
    git("config", "core.hooksPath", hooks);
    git("config", "core.autocrlf", "false");
    git("remote", "add", "origin", origin);
    writeFileSync(join(repo, "CHANGELOG.md"), LOG);
    git("add", "CHANGELOG.md");
    git("commit", "--quiet", "-m", "init");
    git("push", "--quiet", "origin", "main");
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("--dry-run checks everything and changes nothing", () => {
    const lines = [];
    release(["0.2.0", "--dry-run"], { cwd: repo, date: "2026-11-25", log: (l) => lines.push(l) });
    assert.match(lines.join("\n"), /All checks passed[\s\S]*- New thing\./);
    assert.equal(readFileSync(join(repo, "CHANGELOG.md"), "utf8"), LOG);
    assert.equal(git("tag", "--list"), "");
  });

  test("commits and tags", () => {
    release(["0.2.0"], { cwd: repo, ...quiet });
    assert.equal(git("log", "-1", "--format=%s"), "chore: release 0.2.0");
    assert.equal(git("tag", "--list"), "v0.2.0");
    assert.match(readFileSync(join(repo, "CHANGELOG.md"), "utf8"), /## \[0\.2\.0\] - 2026-11-25/);
    assert.equal(git("status", "--porcelain"), "");
  });

  test("undoes the changelog edit when the commit hook fails", () => {
    writeFileSync(join(hooks, "commit-msg"), "#!/bin/sh\necho 'hook says no' >&2\nexit 1\n", { mode: 0o755 });
    const head = git("rev-parse", "HEAD");
    assert.throws(
      () => release(["0.2.0"], { cwd: repo, ...quiet }),
      /hook says no[\s\S]*Nothing was released/,
    );
    assert.equal(git("rev-parse", "HEAD"), head);
    assert.equal(git("status", "--porcelain"), "");
    assert.equal(readFileSync(join(repo, "CHANGELOG.md"), "utf8"), LOG);
    assert.equal(git("tag", "--list"), "");
  });

  test("undoes the commit when tagging fails", () => {
    // A ref named like the tag's directory makes `git tag v0.2.0` fail after the commit exists.
    git("update-ref", "refs/tags/v0.2.0/x", "HEAD");
    const head = git("rev-parse", "HEAD");
    assert.throws(() => release(["0.2.0"], { cwd: repo, ...quiet }), /Nothing was released/);
    assert.equal(git("rev-parse", "HEAD"), head);
    assert.equal(git("status", "--porcelain"), "");
    assert.equal(readFileSync(join(repo, "CHANGELOG.md"), "utf8"), LOG);
  });

  test("lists every problem before changing anything", () => {
    git("switch", "--quiet", "-c", "feature");
    writeFileSync(join(repo, "stray.txt"), "x");
    git("tag", "v0.2.0");
    assert.throws(
      () => release(["0.2.0"], { cwd: repo, ...quiet }),
      (error) =>
        error instanceof ReleaseError &&
        /Release from main only/.test(error.message) &&
        /not clean[\s\S]*stray\.txt/.test(error.message) &&
        /Tag v0\.2\.0 already exists/.test(error.message),
    );
    assert.equal(readFileSync(join(repo, "CHANGELOG.md"), "utf8"), LOG);
  });

  test("refuses when main is behind origin/main", () => {
    const other = join(dir, "other");
    execFileSync("git", ["clone", "--quiet", join(dir, "origin.git"), other]);
    const g = (...args) => execFileSync("git", args, { cwd: other, encoding: "utf8" });
    g("config", "user.name", "Test");
    g("config", "user.email", "test@example.invalid");
    g("config", "commit.gpgsign", "false");
    g("config", "core.hooksPath", hooks);
    g("commit", "--quiet", "--allow-empty", "-m", "elsewhere");
    g("push", "--quiet", "origin", "main");
    assert.throws(() => release(["0.2.0"], { cwd: repo, ...quiet }), /not level with origin\/main/);
  });

  test("reports an unreachable origin", () => {
    git("remote", "set-url", "origin", join(dir, "missing.git"));
    assert.throws(() => release(["0.2.0"], { cwd: repo, ...quiet }), /Cannot reach origin/);
  });
});
