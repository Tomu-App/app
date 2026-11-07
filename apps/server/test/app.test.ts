import { opsPageSchema } from "@tomu/shared";
import { expect, test } from "bun:test";
import { createApp } from "../src/app.ts";
import { readConfig } from "../src/config.ts";
import { clientIp, limitKey } from "../src/ip.ts";
import { WindowCounter } from "../src/limits.ts";
import { Store } from "../src/store.ts";
import { memDb } from "./helpers.ts";

const D = "D".repeat(22);
const env = (id: string) => ({ id, n: "A".repeat(16), c: "Zm9v" });

const setup = () => {
  const h = memDb();
  const store = new Store(h.db);
  const app = createApp({
    store,
    config: readConfig({}),
    docLimit: new WindowCounter(30, 3_600_000, Date.now),
    ipOf: () => "1.2.3.4",
  });
  return { store, app };
};
const post = (app: ReturnType<typeof setup>["app"], id: string) =>
  app.request(`/api/docs/${id}`, { method: "POST" });

test("POST creates, second POST conflicts", async () => {
  const { app } = setup();
  expect((await post(app, D)).status).toBe(201);
  expect((await post(app, D)).status).toBe(409);
});

test("POST rejects malformed ids", async () => {
  const { app } = setup();
  for (const id of ["short", "D".repeat(23), "D".repeat(21) + "+"])
    expect((await post(app, id)).status).toBe(400);
});

test("POST is limited to 30 new docs per IP per hour; conflicts do not count", async () => {
  const { app } = setup();
  await post(app, D);
  for (let i = 0; i < 5; i++) await post(app, D); // 409s
  const codes: number[] = [];
  for (let i = 0; i < 30; i++) codes.push((await post(app, String(i).padStart(22, "0"))).status);
  expect(codes.filter((c) => c === 201).length).toBe(29);
  expect(codes.at(-1)).toBe(429);
});

test("GET ops returns a schema-valid page", async () => {
  const { app, store } = setup();
  store.createDoc(D);
  store.appendOp(D, env("a".repeat(22)));
  const res = await app.request(`/api/docs/${D}/ops?since=0`);
  expect(res.status).toBe(200);
  expect(opsPageSchema.parse(await res.json())).toEqual({
    ops: [{ seq: 1, ...env("a".repeat(22)) }],
    head: 1,
  });
});

test("GET ops: 404 for a missing doc, 400 for bad params, limit capped at 500", async () => {
  const { app, store } = setup();
  expect((await app.request(`/api/docs/${D}/ops`)).status).toBe(404);
  store.createDoc(D);
  for (const q of ["since=-1", "since=abc", "since=1.5", "limit=0", "limit=x"])
    expect((await app.request(`/api/docs/${D}/ops?${q}`)).status).toBe(400);
  for (let i = 0; i < 600; i++) store.appendOp(D, env(String(i).padStart(22, "0")));
  const body = opsPageSchema.parse(await (await app.request(`/api/docs/${D}/ops?limit=9999`)).json());
  expect(body.ops.length).toBe(500);
  expect(body.head).toBe(600);
  const rest = opsPageSchema.parse(await (await app.request(`/api/docs/${D}/ops?since=500`)).json());
  expect(rest.ops.map((o) => o.seq)).toEqual(Array.from({ length: 100 }, (_, i) => 501 + i));
});

test("GET ops rejects a malformed id", async () => {
  expect((await setup().app.request(`/api/docs/short/ops`)).status).toBe(400);
});

test("health answers ok", async () => {
  const res = await setup().app.request("/api/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("CORS only for allowed origins", async () => {
  const { app } = setup();
  const ok = await app.request("/api/health", { headers: { Origin: "http://localhost:5173" } });
  const bad = await app.request("/api/health", { headers: { Origin: "https://evil.example" } });
  expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
  expect(bad.headers.get("access-control-allow-origin")).toBeNull();
});

test("readConfig defaults and parsing", () => {
  expect(readConfig({})).toEqual({
    port: 3000,
    dbPath: "./tomu.db",
    allowedOrigins: ["http://localhost:5173"],
    trustCloudflare: false,
    migrationsFolder: undefined,
  });
  const c = readConfig({
    PORT: "8080",
    DB_PATH: "/data/x.db",
    ALLOWED_ORIGINS: "https://tomu.foo, https://app.tomu.foo",
    TRUST_CLOUDFLARE: "1",
    MIGRATIONS_FOLDER: "/app/drizzle",
  });
  expect(c).toEqual({
    port: 8080,
    dbPath: "/data/x.db",
    allowedOrigins: ["https://tomu.foo", "https://app.tomu.foo"],
    trustCloudflare: true,
    migrationsFolder: "/app/drizzle",
  });
});

test("clientIp trusts cf-connecting-ip only when configured", () => {
  const h = new Headers({ "cf-connecting-ip": "9.9.9.9" });
  expect(clientIp(h, "10.0.0.1", true)).toBe("9.9.9.9");
  expect(clientIp(h, "10.0.0.1", false)).toBe("10.0.0.1");
  expect(clientIp(new Headers(), "10.0.0.1", true)).toBe("10.0.0.1");
  expect(clientIp(new Headers(), null, false)).toBe("unknown");
});

test("limitKey groups IPv6 by /64 and unwraps IPv4-mapped addresses", () => {
  expect(limitKey("1.2.3.4")).toBe("1.2.3.4");
  expect(limitKey("::ffff:1.2.3.4")).toBe("1.2.3.4");
  expect(limitKey("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
  expect(limitKey("2001:db8:1:2:bbbb:cccc:dddd:eeee")).toBe("2001:db8:1:2::/64");
  expect(limitKey("2001:DB8::1")).toBe("2001:db8:0:0::/64");
  expect(limitKey("::1")).toBe("0:0:0:0::/64");
  expect(limitKey("unknown")).toBe("unknown");
});

test("clientIp ignores a cf-connecting-ip that is not an IP address", () => {
  for (const junk of ["", "evil", "1.2.3", "999.1.1.1", "1.2.3.4, 5.6.7.8", "::g"])
    expect(clientIp(new Headers({ "cf-connecting-ip": junk }), "10.0.0.1", true)).toBe("10.0.0.1");
  expect(clientIp(new Headers({ "cf-connecting-ip": "2001:db8::1" }), "10.0.0.1", true)).toBe("2001:db8::1");
});
