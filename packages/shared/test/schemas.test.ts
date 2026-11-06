import { expect, test } from "vitest";
import { newDocId, newOpId } from "../src/ids.ts";
import { envelopeSchema, envelopeSize, MAX_ENVELOPE_BYTES } from "../src/schemas/envelope.ts";
import { clientMessageSchema, opsPageSchema, serverMessageSchema } from "../src/schemas/messages.ts";
import { labelOpSchema, listOpSchema, MAX_ITEM_TEXT, opSchema } from "../src/schemas/ops.ts";
import { addOp, initLabel, linkOp, SPEC_EXAMPLES, unlinkOp } from "./fixtures.ts";

test("accepts every op type from the spec", () => {
  for (const op of SPEC_EXAMPLES) expect(opSchema.safeParse(op).success, op.t).toBe(true);
});

test("rejects unknown version and type", () => {
  expect(opSchema.safeParse({ ...addOp, v: 2 }).success).toBe(false);
  expect(opSchema.safeParse({ ...addOp, t: "move" }).success).toBe(false);
});

test("list ops and label ops are disjoint except init", () => {
  expect(labelOpSchema.safeParse(addOp).success).toBe(false);
  expect(listOpSchema.safeParse(linkOp).success).toBe(false);
  expect(listOpSchema.safeParse(initLabel).success).toBe(true);
  expect(labelOpSchema.safeParse(initLabel).success).toBe(true);
});

test("text limits", () => {
  expect(MAX_ITEM_TEXT).toBe(900);
  expect(opSchema.safeParse({ ...addOp, text: "ä".repeat(MAX_ITEM_TEXT) }).success).toBe(true);
  expect(opSchema.safeParse({ ...addOp, text: "x".repeat(MAX_ITEM_TEXT + 1) }).success).toBe(false);
  expect(opSchema.safeParse({ ...addOp, text: "   " }).success).toBe(false);
  expect(opSchema.safeParse({ ...addOp, text: "Milch\nBrot" }).success).toBe(false);
  expect(opSchema.safeParse({ ...addOp, text: "a\u0001b" }).success).toBe(false);
});

test("lone surrogates are rejected", () => {
  expect(opSchema.safeParse({ ...addOp, text: "a\ud800b" }).success).toBe(false);
  expect(opSchema.safeParse({ ...addOp, text: "\udc00".repeat(900) }).success).toBe(false);
  expect(opSchema.safeParse({ ...addOp, text: "😀" }).success).toBe(true);
});

test("ids and timestamps are validated", () => {
  expect(opSchema.safeParse({ ...addOp, item: "not-a-uuid" }).success).toBe(false);
  expect(opSchema.safeParse({ ...linkOp, key: "short" }).success).toBe(false);
  expect(opSchema.safeParse({ ...unlinkOp, seen: ["x"] }).success).toBe(false);
  expect(opSchema.safeParse({ ...addOp, ts: -1 }).success).toBe(false);
  expect(opSchema.safeParse({ ...addOp, ts: 1.5 }).success).toBe(false);
});

test("subscribe caps at 500 docs", () => {
  const docs = (n: number) => Array.from({ length: n }, () => ({ doc: newDocId(), since: 0 }));
  expect(clientMessageSchema.safeParse({ type: "subscribe", docs: docs(500) }).success).toBe(true);
  expect(clientMessageSchema.safeParse({ type: "subscribe", docs: docs(501) }).success).toBe(false);
});

test("envelope shape and size", () => {
  const env = { id: newOpId(), n: "AAAAAAAAAAAAAAAA", c: "AAAA" };
  expect(envelopeSchema.safeParse(env).success).toBe(true);
  expect(envelopeSchema.safeParse({ ...env, id: "x" }).success).toBe(false);
  expect(envelopeSize(env)).toBe(new TextEncoder().encode(JSON.stringify(env)).length);
  expect(MAX_ENVELOPE_BYTES).toBe(4096);
});

test("server messages and ops page parse", () => {
  const env = { id: newOpId(), n: "AAAAAAAAAAAAAAAA", c: "AAAA" };
  const doc = newDocId();
  expect(serverMessageSchema.safeParse({ type: "ops", doc, ops: [{ ...env, seq: 1 }], head: 1 }).success).toBe(true);
  expect(serverMessageSchema.safeParse({ type: "error", code: "rate_limited", message: "slow down" }).success).toBe(true);
  expect(serverMessageSchema.safeParse({ type: "error", code: "nope", message: "" }).success).toBe(false);
  expect(opsPageSchema.safeParse({ ops: [{ ...env, seq: 3 }], head: 3 }).success).toBe(true);
});
