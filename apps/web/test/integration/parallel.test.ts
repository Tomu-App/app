import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { client, startTestServer, stopClients, waitFor } from "./harness.ts";

let server: Awaited<ReturnType<typeof startTestServer>>;
beforeAll(async () => {
  server = await startTestServer();
});
afterEach(stopClients);
afterAll(async () => {
  await server.stop();
});

test("two devices edit the same list at the same time; changes show up within a second", async () => {
  const lisa = await client("lisa", server);
  const mike = await client("mike", server);
  const id = await lisa.createList("Party");
  await waitFor(() => lisa.status === "synced", 3000);
  await mike.openLink(lisa.shareList(id));
  await waitFor(() => mike.list(id)?.title === "Party", 3000);

  await Promise.all([lisa.addItems(id, "A1, A2, A3"), mike.addItems(id, "M1, M2, M3")]);
  const texts = (t: typeof lisa): string => t.list(id)!.items.map((i) => i.text).join();
  await waitFor(() => texts(lisa).split(",").length === 6 && texts(lisa) === texts(mike), 1000);
  expect([...texts(lisa).split(",")].sort()).toEqual(["A1", "A2", "A3", "M1", "M2", "M3"]);

  const x = lisa.list(id)!.items[0]!.id;
  await Promise.all([lisa.setChecked(id, x, true), mike.editItem(id, x, "Neu")]);
  const view = (t: typeof lisa) => t.list(id)!.items.find((i) => i.id === x);
  await waitFor(
    () => [lisa, mike].every((t) => view(t)?.text === "Neu" && view(t)?.checked === true),
    1000,
  );
  expect(view(lisa)).toMatchObject({ text: "Neu", checked: true });
  expect(view(mike)).toMatchObject({ text: "Neu", checked: true });
});
