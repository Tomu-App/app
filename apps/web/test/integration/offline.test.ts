import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { client, createNet, startTestServer, stopClients, waitFor } from "./harness.ts";

let server: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => {
  server = await startTestServer();
});
afterEach(stopClients);
afterAll(async () => {
  await server.stop();
});

test("harness client reaches synced against the real server", async () => {
  const t = await client("probe", server);
  await t.createList("Probe");
  await waitFor(() => t.status === "synced", 3000);
});

test("offline edits sync after reconnect", async () => {
  const net = createNet();
  const lisa = await client("lisa", server, net);
  const mike = await client("mike", server);
  const id = await lisa.createList("Einkauf");
  await waitFor(() => lisa.status === "synced", 3000);
  await mike.openLink(lisa.shareList(id));
  await waitFor(() => mike.list(id)?.title === "Einkauf", 3000);

  net.offline();
  await waitFor(() => lisa.status === "offline");
  await lisa.addItems(id, "Milch, Brot, Eier");
  expect(lisa.list(id)!.items.length).toBe(3);
  expect(mike.list(id)!.items).toEqual([]);

  net.online();
  await waitFor(() => mike.list(id)!.items.map((i) => i.text).join() === "Milch,Brot,Eier", 3000);
  await waitFor(() => lisa.status === "synced");
});

test("offline edits survive a reload before reconnecting", async () => {
  const net = createNet();
  const lisa = await client("lisa", server, net, "lisa-reload");
  const mike = await client("mike", server);
  const id = await lisa.createList("Baumarkt");
  await waitFor(() => lisa.status === "synced", 3000);
  await mike.openLink(lisa.shareList(id));
  await waitFor(() => mike.list(id)?.title === "Baumarkt", 3000);

  net.offline();
  await waitFor(() => lisa.status === "offline");
  await lisa.addItems(id, "Schrauben, Dübel");
  await lisa.stop();

  const lisa2 = await client("lisa", server, undefined, "lisa-reload");
  expect(lisa2.list(id)!.items.map((i) => i.text)).toEqual(["Schrauben", "Dübel"]);
  await waitFor(() => mike.list(id)!.items.map((i) => i.text).join() === "Schrauben,Dübel", 3000);
  await waitFor(() => lisa2.status === "synced");
});
