import { serverMessageSchema, type ServerMessage } from "@tomu/shared";
import { openDb } from "../src/db/open.ts";
import type { Conn } from "../src/hub.ts";

export const memDb = () => openDb(":memory:");

export function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    },
  };
}

export const lastActivity = (h: ReturnType<typeof openDb>, id: string) =>
  h.sqlite.query<{ t: number }, [string]>("select last_activity_at as t from docs where id = ?").get(id)?.t;

/** Fills a doc with `n` raw ops (seq 1..n) without going through the store. */
export const fillOps = (h: ReturnType<typeof openDb>, doc: string, n: number) =>
  h.sqlite.run(
    `with recursive k(i) as (select 1 union all select i + 1 from k where i < ${n})
     insert into ops select '${doc}', i, 'x' || i, '{}', 0 from k`,
  );

/** In-memory connection; validates every message the hub sends. */
export class FakeConn implements Conn {
  sent: ServerMessage[] = [];
  /** Set to false to simulate a full socket buffer. */
  writable = true;
  ready(): boolean {
    return this.writable;
  }
  send(msg: ServerMessage): void {
    this.sent.push(serverMessageSchema.parse(msg));
  }
  of<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.sent.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
  }
}
