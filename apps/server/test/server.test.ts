import { decryptOp, encryptOp, importDocKey, newDocId, newDocKey, serverMessageSchema, type ServerMessage } from "@tomu/shared";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { readConfig } from "../src/config.ts";
import { CONNS_PER_IP, MAX_FRAME_BYTES } from "../src/limits.ts";
import { startServer } from "../src/server.ts";

const ORIGIN = "http://localhost:5173";
let srv: ReturnType<typeof startServer>;
let url: string;

beforeEach(() => {
  srv = startServer({ ...readConfig({}), port: 0, dbPath: ":memory:" });
  url = srv.url;
});
afterEach(async () => {
  await srv.stop();
});

type Client = {
  ws: WebSocket;
  send(msg: unknown): void;
  next<T extends ServerMessage["type"]>(type: T): Promise<Extract<ServerMessage, { type: T }>>;
  closed: Promise<number>;
};

/** Opens a socket and resolves once it is open; `next` waits for the next message of a type. */
function openWs(origin = ORIGIN): Promise<Client> {
  const ws = new WebSocket(`${url.replace("http", "ws")}/api/ws`, { headers: { Origin: origin } } as never);
  const inbox: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.onmessage = (e) => {
    inbox.push(serverMessageSchema.parse(JSON.parse(String(e.data))));
    waiters.splice(0).forEach((w) => w());
  };
  const closed = new Promise<number>((r) => (ws.onclose = (e) => r(e.code)));
  const client: Client = {
    ws,
    closed,
    send: (msg) => ws.send(JSON.stringify(msg)),
    next: async (type) => {
      for (;;) {
        const i = inbox.findIndex((m) => m.type === type);
        if (i >= 0) return inbox.splice(i, 1)[0] as never;
        await new Promise<void>((r) => waiters.push(r));
      }
    },
  };
  return new Promise((resolve, reject) => {
    ws.onopen = () => resolve(client);
    ws.onerror = () => reject(new Error("websocket failed"));
  });
}

test("Lisa writes, Mike reads it live, server only stores ciphertext", async () => {
  const doc = newDocId();
  const key = await importDocKey(newDocKey());
  expect((await fetch(`${url}/api/docs/${doc}`, { method: "POST" })).status).toBe(201);
  const mike = await openWs();
  mike.send({ type: "subscribe", docs: [{ doc, since: 0 }] });
  expect(await mike.next("ops")).toEqual({ type: "ops", doc, ops: [], head: 0 });
  const lisa = await openWs();
  const env = await encryptOp(doc, key, { v: 1, t: "title", text: "Wochenende", c: "A".repeat(22), ts: 1 });
  lisa.send({ type: "op", doc, op: env });
  expect(await lisa.next("ack")).toEqual({ type: "ack", doc, id: env.id, seq: 1 });
  const live = await mike.next("op");
  expect((await decryptOp(doc, key, live.op))?.op).toEqual(expect.objectContaining({ t: "title", text: "Wochenende" }));
  const page = await (await fetch(`${url}/api/docs/${doc}/ops`)).json();
  expect(page.head).toBe(1);
  expect(JSON.stringify(page)).not.toContain("Wochenende");
  lisa.ws.close();
  mike.ws.close();
});

test("upgrade from a foreign origin is rejected with 403", async () => {
  const res = await fetch(`${url}/api/ws`, {
    headers: {
      Origin: "https://evil.example",
      Upgrade: "websocket",
      Connection: "Upgrade",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Version": "13",
    },
  });
  expect(res.status).toBe(403);
});

test(`connection ${CONNS_PER_IP + 1} from one IP is rejected, closing one frees a slot`, async () => {
  const open = await Promise.all(Array.from({ length: CONNS_PER_IP }, () => openWs()));
  await expect(openWs()).rejects.toThrow();
  open[0]!.ws.close();
  await open[0]!.closed;
  const again = await openWs();
  again.ws.close();
  for (const c of open.slice(1)) c.ws.close();
});

test("frames over 64 KB close the connection, the server keeps running", async () => {
  const c = await openWs();
  c.ws.send("x".repeat(MAX_FRAME_BYTES + 6_000));
  expect(await c.closed).not.toBe(1000);
  expect((await fetch(`${url}/api/health`)).status).toBe(200);
});

test("binary frames are invalid, the connection stays open", async () => {
  const c = await openWs();
  c.ws.send(new Uint8Array([1, 2, 3]));
  expect(await c.next("error")).toEqual(expect.objectContaining({ code: "invalid" }));
  c.send({ type: "ping" });
  expect(await c.next("pong")).toEqual({ type: "pong" });
  c.ws.close();
});

test("non-websocket requests reach the REST app", async () => {
  expect(await (await fetch(`${url}/api/health`)).json()).toEqual({ ok: true });
  expect((await fetch(`${url}/api/ws`)).status).toBe(426);
});
