import { expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/open.ts";
import { memDb } from "./helpers.ts";

test("creates docs and ops tables", () => {
  const { sqlite } = memDb();
  const names = sqlite
    .query<{ name: string }, []>("select name from sqlite_master where type='table'")
    .all()
    .map((r) => r.name);
  expect(names).toEqual(expect.arrayContaining(["docs", "ops"]));
});

test("deleting a doc cascades to its ops", () => {
  const { sqlite } = memDb();
  sqlite.run("insert into docs values ('d', 1, 1)");
  sqlite.run("insert into ops values ('d', 1, 'o', '{}', 1)");
  sqlite.run("delete from docs where id = 'd'");
  expect(sqlite.query("select count(*) as n from ops").get()).toEqual({ n: 0 });
});

test("ops need an existing doc", () => {
  const { sqlite } = memDb();
  expect(() => sqlite.run("insert into ops values ('nope', 1, 'o', '{}', 1)")).toThrow();
});

test("op_id is unique per doc", () => {
  const { sqlite } = memDb();
  sqlite.run("insert into docs values ('d', 1, 1)");
  sqlite.run("insert into ops values ('d', 1, 'o', '{}', 1)");
  expect(() => sqlite.run("insert into ops values ('d', 2, 'o', '{}', 1)")).toThrow();
});

test("uses WAL on a file database", () => {
  const path = join(tmpdir(), `tomu-${crypto.randomUUID()}.db`);
  const h = openDb(path);
  expect(h.sqlite.query("pragma journal_mode").get()).toEqual({ journal_mode: "wal" });
  h.close();
  for (const p of [path, `${path}-wal`, `${path}-shm`]) rmSync(p, { force: true });
});

test("reopen keeps data and re-running migrations is a no-op", () => {
  const path = join(tmpdir(), `tomu-${crypto.randomUUID()}.db`);
  const a = openDb(path);
  a.sqlite.run("insert into docs values ('d', 1, 1)");
  a.close();
  const b = openDb(path);
  expect(b.sqlite.query("select count(*) as n from docs").get()).toEqual({ n: 1 });
  b.close();
  for (const p of [path, `${path}-wal`, `${path}-shm`]) rmSync(p, { force: true });
});
