import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions, cutRelease, today, unreleasedBody } from "./release.mjs";

const REPO = "https://github.com/Tomu-App/app";
const log = `# Changelog

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

test("cutRelease moves [Unreleased] under the new version and opens a fresh one", () => {
  const out = cutRelease(log, "0.2.0", "2026-11-25");
  assert.match(out, /## \[Unreleased\]\n\n## \[0\.2\.0\] - 2026-11-25\n\n### Added\n\n- New thing\./);
  assert.equal(unreleasedBody(out), "");
  assert.match(out, /^\[Unreleased\]: .+\/compare\/v0\.2\.0\.\.\.HEAD$/m);
  assert.match(out, /^\[0\.2\.0\]: .+\/compare\/v0\.1\.0\.\.\.v0\.2\.0$/m);
  assert.match(out, /^\[0\.1\.0\]: .+\/releases\/tag\/v0\.1\.0$/m);
});

test("cutRelease refuses an empty [Unreleased]", () => {
  const empty = cutRelease(log, "0.2.0", "2026-11-25");
  assert.throws(() => cutRelease(empty, "0.3.0", "2026-11-26"), /no entries/);
});

test("cutRelease refuses bad, existing and lower versions", () => {
  assert.throws(() => cutRelease(log, "v0.2.0", "2026-11-25"), /not a version/);
  assert.throws(() => cutRelease(log, "0.1.0", "2026-11-25"), /already in/);
  assert.throws(() => cutRelease(log, "0.0.9", "2026-11-25"), /must be higher/);
});

test("compareVersions compares numerically", () => {
  assert.ok(compareVersions("0.10.0", "0.9.0") > 0);
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
});

test("today formats local dates", () => {
  assert.equal(today(new Date(2026, 0, 5)), "2026-01-05");
});
