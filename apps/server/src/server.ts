import { createApp } from "./app.ts";
import type { Config } from "./config.ts";
import { openDb } from "./db/open.ts";
import { Hub, type Conn } from "./hub.ts";
import { clientIp, limitKey } from "./ip.ts";
import { CONNS_PER_IP, ConnCounter, DOCS_PER_IP_PER_HOUR, MAX_FRAME_BYTES, WindowCounter } from "./limits.ts";
import { Store } from "./store.ts";

export const PURGE_INTERVAL_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Catch-up stops sending while more than this is buffered on a socket, and resumes on drain. */
export const CATCHUP_BUFFER_BYTES = 1_048_576;

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
    ipOf: (c) => c.env.ip,
  });

  const server = Bun.serve<WsData>({
    port: config.port,
    fetch(req, server) {
      const ip = keyOf(req.headers, server.requestIP(req)?.address ?? null);
      if (new URL(req.url).pathname !== "/api/ws") return app.fetch(req, { ip });
      if (req.headers.get("upgrade")?.toLowerCase() !== "websocket")
        return new Response(null, { status: 426 });
      const origin = req.headers.get("origin");
      if (origin === null || !config.allowedOrigins.includes(origin))
        return new Response(null, { status: 403 });
      if (!conns.acquire(ip)) return new Response(null, { status: 429 });
      if (server.upgrade(req, { data: { key: ip } })) return undefined;
      conns.release(ip);
      return new Response(null, { status: 400 });
    },
    websocket: {
      maxPayloadLength: MAX_FRAME_BYTES,
      // A reader so slow that 16 MB pile up is dropped instead of losing messages silently;
      // it reconnects and resubscribes from its last seq.
      closeOnBackpressureLimit: true,
      idleTimeout: 90, // clients ping every 30 s
      open(ws) {
        const conn: Conn = {
          send: (msg) => void ws.send(JSON.stringify(msg)),
          ready: () => ws.getBufferedAmount() < CATCHUP_BUFFER_BYTES,
        };
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
      drain(ws) {
        if (ws.data.conn) hub.drain(ws.data.conn);
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
    store,
    url: `http://localhost:${server.port}`,
    async stop() {
      clearInterval(purge);
      clearInterval(sweep);
      await server.stop(true);
      handle.close();
    },
  };
}
