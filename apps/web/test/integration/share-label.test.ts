import { afterAll, beforeAll, expect, test } from "vitest";
import type { Tomu } from "#lib/tomu/index.js";
import { client, startTestServer, stopClients, TEST_ORIGIN, waitFor } from "./harness.ts";

let server: Awaited<ReturnType<typeof startTestServer>>;
let lisa: Tomu;
let mike: Tomu;
let label: string;
let wochenende: string;
let geburtstag: string;
let privat: string;

beforeAll(async () => {
  server = await startTestServer();
  lisa = await client("lisa", server);
  mike = await client("mike", server);
});
afterAll(async () => {
  await stopClients();
  await server.stop();
});

const titles = (t: Tomu): string[] => t.lists.map((l) => l.title).sort();

test("Lisa shares a label; Mike sees Lisa / Familie with all its lists", async () => {
  await lisa.setDisplayName("Lisa");
  label = await lisa.createLabel("Familie");
  wochenende = await lisa.createList("Wochenende", [label]);
  geburtstag = await lisa.createList("Geburtstag", [label]);
  privat = await lisa.createList("Privat");
  await lisa.addItems(wochenende, "Milch");
  const link = await lisa.shareLabel(label);
  // A link is sent after the docs exist on the server; a doc Mike subscribes to too early is retried only after 60 s.
  await waitFor(() => lisa.status === "synced", 3000);
  await mike.openLink(link);

  await waitFor(
    () => mike.labels.some((l) => l.id === label && l.name === "Familie" && l.shared && l.owner === "Lisa"),
    3000,
  );
  await waitFor(() => titles(mike).join() === "Geburtstag,Wochenende", 3000);
  expect(mike.labels).toContainEqual({ id: label, name: "Familie", shared: true, owner: "Lisa" });
  expect(titles(mike)).toEqual(["Geburtstag", "Wochenende"]);
  for (const l of mike.lists) {
    expect(l.labelIds).toEqual([label]);
    expect(l.origin).toBe("label");
  }
  expect(mike.lists.some((l) => l.id === privat)).toBe(false);
});

test("Mike creates a list with Lisa's label; it appears at Lisa within a second", async () => {
  await mike.createList("Grillen", [label]);
  await waitFor(() => lisa.lists.some((l) => l.title === "Grillen"), 1000);
});

test("removing the label makes the list disappear at Mike only", async () => {
  await lisa.setListLabels(wochenende, []);
  await waitFor(() => !mike.lists.some((l) => l.title === "Wochenende"), 3000);
  expect(mike.docStatus(wochenende)).not.toBe("list");
  expect(lisa.lists.some((l) => l.title === "Wochenende")).toBe(true);
});

test("deleting a list removes it everywhere", async () => {
  await mike.deleteList(geburtstag);
  await waitFor(() => !lisa.lists.some((l) => l.title === "Geburtstag"), 3000);
  await waitFor(() => lisa.docStatus(geburtstag) === "gone", 3000);
  expect(mike.lists.some((l) => l.title === "Geburtstag")).toBe(false);
});

test("the server stores only ciphertext", async () => {
  for (const id of [label, wochenende]) {
    const res = await fetch(`${server.url}/api/docs/${id}/ops`, { headers: { Origin: TEST_ORIGIN } });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(2);
    for (const secret of ["Familie", "Lisa", "Wochenende", "Milch"]) expect(body).not.toContain(secret);
  }
});
