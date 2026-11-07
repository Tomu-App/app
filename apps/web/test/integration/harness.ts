import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startTomu, type Tomu } from "#lib/tomu/index.js";

export const TEST_ORIGIN = "http://localhost:5173";

type Connect = (url: string) => WebSocket;

const SERVER_DIR = fileURLToPath(new URL("../../../server", import.meta.url));

// Every spawned server is killed when the test process exits, even after a failure.
const children = new Set<ChildProcess>();
process.on("exit", () => {
  for (const c of children) c.kill();
});

/** Starts the real server (Bun child process, in-memory DB, random port) and resolves once it listens. */
export async function startTestServer(): Promise<{ url: string; stop(): Promise<void> }> {
  const child = spawn("bun", ["src/main.ts"], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: "0", DB_PATH: ":memory:", ALLOWED_ORIGINS: TEST_ORIGIN },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  let log = "";
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server did not start in time: ${log}`)), 10_000);
    const onData = (chunk: Buffer): void => {
      log += chunk.toString();
      const m = /tomu server listening on port (\d+)/.exec(log);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", (c: Buffer) => {
      log += c.toString();
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited with ${code}: ${log}`));
    });
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  }).catch((e: unknown) => {
    child.kill();
    children.delete(child);
    throw e;
  });
  return {
    url: `http://localhost:${port}`,
    async stop() {
      child.kill();
      await exited;
      children.delete(child);
    },
  };
}

/** A switchable network: while offline, `connect` and `fetch` throw and all open sockets are closed. */
export function createNet(): {
  connect: Connect;
  fetch: typeof fetch;
  events: EventTarget;
  offline(): void;
  online(): void;
} {
  const events = new EventTarget();
  const sockets = new Set<WebSocket>();
  let up = true;
  return {
    events,
    connect(url) {
      if (!up) throw new Error("offline");
      const ws = openSocket(url);
      sockets.add(ws);
      ws.addEventListener("close", () => sockets.delete(ws));
      return ws;
    },
    fetch(input, init) {
      if (!up) return Promise.reject(new TypeError("offline"));
      return fetchWithOrigin(input, init);
    },
    offline() {
      up = false;
      for (const ws of [...sockets]) ws.close();
    },
    online() {
      up = true;
      events.dispatchEvent(new Event("online"));
    },
  };
}

function openSocket(url: string): WebSocket {
  return new WebSocket(url, { headers: { Origin: TEST_ORIGIN } } as unknown as string[]);
}

const fetchWithOrigin: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.set("Origin", TEST_ORIGIN);
  return fetch(input, { ...init, headers });
};

const started = new Set<Tomu>();

/** Starts a client against the test server; `stopClients` stops all of them. */
export async function client(
  name: string,
  server: { url: string },
  net?: ReturnType<typeof createNet>,
  dbName?: string,
): Promise<Tomu> {
  const t = await startTomu({
    apiUrl: server.url,
    dbName: dbName ?? `${name}-${Math.random().toString(36).slice(2)}`,
    backoff: { baseMs: 20, maxMs: 100 },
    locks: null,
    connect: net ? net.connect : openSocket,
    fetch: net ? net.fetch : fetchWithOrigin,
    online: net ? net.events : null,
  });
  started.add(t);
  return t;
}

export async function stopClients(): Promise<void> {
  const all = [...started];
  started.clear();
  await Promise.all(all.map((t) => t.stop()));
}

export async function waitFor(cond: () => boolean, timeoutMs = 1000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`waitFor timed out after ${timeoutMs} ms`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
