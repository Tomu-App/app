import { DOC_ID_RE } from "@tomu/shared";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { Config } from "./config.ts";
import type { WindowCounter } from "./limits.ts";
import type { Store } from "./store.ts";

export const PAGE_LIMIT = 500;

/** `ip`: the client's limit key, set by the server per request. */
export type AppEnv = { Bindings: { ip: string } };

export type AppDeps = {
  store: Store;
  config: Config;
  docLimit: WindowCounter;
  ipOf: (c: Context<AppEnv>) => string;
};

const NON_NEG_INT = /^\d+$/;

/** REST api: create docs, page through their ops, health. */
export function createApp({ store, config, docLimit, ipOf }: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(
    "/api/*",
    cors({
      origin: (origin) => (config.allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST"],
    }),
  );

  app.get("/api/health", (c) => {
    store.ping();
    return c.json({ ok: true });
  });

  app.post("/api/docs/:id", (c) => {
    const id = c.req.param("id");
    if (!DOC_ID_RE.test(id)) return c.json({ error: "invalid" }, 400);
    if (store.hasDoc(id)) return c.json({ error: "exists" }, 409);
    if (!docLimit.hit(ipOf(c))) return c.json({ error: "rate_limited" }, 429);
    return store.createDoc(id) === "created" ? c.json({ ok: true }, 201) : c.json({ error: "exists" }, 409);
  });

  app.get("/api/docs/:id/ops", (c) => {
    const id = c.req.param("id");
    const since = c.req.query("since") ?? "0";
    const limit = c.req.query("limit") ?? String(PAGE_LIMIT);
    if (!DOC_ID_RE.test(id) || !NON_NEG_INT.test(since) || !NON_NEG_INT.test(limit) || Number(limit) < 1)
      return c.json({ error: "invalid" }, 400);
    const page = store.opsSince(id, Number(since), Math.min(Number(limit), PAGE_LIMIT));
    return page ? c.json(page) : c.json({ error: "not_found" }, 404);
  });

  return app;
}
