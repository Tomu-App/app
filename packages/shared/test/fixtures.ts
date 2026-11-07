// Shared valid examples for tests, values as in spec.md.
export const C = "AbCdEfGhIjKlMnOpQrStUv";
export const ITEM = "0b6f3c2e-8a4d-4c1e-9f7a-2d5b6e8c9a10";
export const LIST = "f3K9xQ2mLp7RvT1bN8cZaw";
export const KEY = "Qm8T0vXkJ2pLs9aB3cD4eF5gH6iJ7kL8mN9oP0qR1sT";
export const OPID = "Zx9Yw8Vu7Ts6Rq5Po4Nm3L";
const base = { v: 1 as const, c: C, ts: 1793900000000 };
export const initList = { ...base, t: "init" as const, kind: "list" as const };
export const initLabel = { ...base, t: "init" as const, kind: "label" as const };
export const titleOp = { ...base, t: "title" as const, text: "Wochenende" };
export const dropOp = { ...base, t: "drop" as const };
export const addOp = { ...base, t: "add" as const, item: ITEM, text: "Milch" };
export const textOp = { ...base, t: "text" as const, item: ITEM, text: "Hafermilch" };
export const checkOp = { ...base, t: "check" as const, item: ITEM, value: true };
export const delOp = { ...base, t: "del" as const, item: ITEM };
export const metaOp = { ...base, t: "meta" as const, name: "Familie", owner: "Lisa" };
export const linkOp = { ...base, t: "link" as const, list: LIST, key: KEY };
export const unlinkOp = { ...base, t: "unlink" as const, list: LIST, seen: [OPID] };
export const SPEC_EXAMPLES = [
  initList,
  initLabel,
  titleOp,
  dropOp,
  addOp,
  textOp,
  checkOp,
  delOp,
  metaOp,
  linkOp,
  unlinkOp,
];
