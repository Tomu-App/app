import { openDb } from "../src/db/open.ts";

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
