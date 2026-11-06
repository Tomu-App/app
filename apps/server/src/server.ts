import { getConnInfo } from "hono/bun";
import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import { openDb } from "./db/open.ts";
import { Hub, type Conn } from "./hub.ts";
import { clientIp, limitKey } from "./ip.ts";
import { CONNS_PER_IP, ConnCounter, DOCS_PER_IP_PER_HOUR, MAX_FRAME_BYTES, WindowCounter } from "./limits.ts";
import { Store } from "./store.ts";

export const PURGE_INTERVAL_MS = 86_400_000;
const HOUR_MS = 3_600_000;

type WsData = { key: string; conn?: Conn };

/** Starts REST and WebSocket on one port. `port: 0` picks a free port. */
export function startServer(config: Config) {
  const handle = openDb(config.dbPath, config.migrationsFolder);
  const store = new Store(handle.db);
  const hub = new Hub(store);
  const conns = new ConnCounter(CONNS_PER_IP);
  const docLimit = new WindowCounter(DOCS_PER_IP_PER_HOUR, HOUR_MS, Date.now);
  const keyOf = (headers: Headers, socketIp: string | null) =>
    limitKey(clientIp(headers, socketIp, config.trustCloudflare));
  const app = createApp({
    store,
    config,
    docLimit,
    ipOf: (c) => keyOf(c.req.raw.headers, getConnInfo(c).remote.address ?? null),
  });

  const server = Bun.serve<WsData>({
    port: config.port,
    fetch(req, server) {
      if (new URL(req.url).pathname !== "/api/ws") return app.fetch(req, server);
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") return new Response(null, { status: 426 });
      // Browsers always send Origin; native clients may not, and Origin cannot stop them anyway.
      const origin = req.headers.get("origin");
      if (origin !== null && !config.allowedOrigins.includes(origin)) return new Response(null, { status: 403 });
      const key = keyOf(req.headers, server.requestIP(req)?.address ?? null);
      if (!conns.acquire(key)) return new Response(null, { status: 429 });
      if (server.upgrade(req, { data: { key } })) return undefined;
      conns.release(key);
      return new Response(null, { status: 400 });
    },
    websocket: {
      maxPayloadLength: MAX_FRAME_BYTES,
      idleTimeout: 90, // clients ping every 30 s
      open(ws) {
        const conn: Conn = { send: (msg) => ws.send(JSON.stringify(msg)) };
        ws.data.conn = conn;
        hub.open(conn);
      },
      message(ws, message) {
        const conn = ws.data.conn!;
        if (typeof message !== "string") {
          conn.send({ type: "error", code: "invalid", message: "binary frames are not supported" });
          return;
        }
        try {
          hub.message(conn, message);
        } catch (e) {
          console.error("hub error:", e instanceof Error ? e.name : "unknown");
        }
      },
      close(ws) {
        if (ws.data.conn) hub.close(ws.data.conn);
        conns.release(ws.data.key);
      },
    },
  });

  const purge = setInterval(() => {
    const n = store.purgeInactive();
    if (n > 0) console.log(`purged ${n} inactive docs`);
  }, PURGE_INTERVAL_MS);
  const sweep = setInterval(() => docLimit.sweep(), HOUR_MS);

  return {
    server,
    url: `http://localhost:${server.port}`,
    async stop() {
      clearInterval(purge);
      clearInterval(sweep);
      await server.stop(true);
      handle.close();
    },
  };
}
