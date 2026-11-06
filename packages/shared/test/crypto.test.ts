import { readFileSync } from "node:fs";
import { beforeAll, expect, test } from "vitest";
import { decryptOp, encryptOp, EnvelopeTooLargeError, importDocKey } from "../src/crypto.ts";
import { fromBase64Url, toBase64Url } from "../src/encoding.ts";
import { newDocId, newDocKey, newOpId } from "../src/ids.ts";
import { envelopeSize, type Envelope } from "../src/schemas/envelope.ts";
import { MAX_ITEM_TEXT, type Op } from "../src/schemas/ops.ts";
import { addOp } from "./fixtures.ts";

const docId = newDocId();
let k: CryptoKey;
beforeAll(async () => {
  k = await importDocKey(newDocKey());
});

test("round-trips umlauts and emoji", async () => {
  const op = { ...addOp, text: "Brötchen 🥐 für Tante Ilse" };
  const env = await encryptOp(docId, k, op);
  expect(await decryptOp(docId, k, env)).toEqual({ opId: env.id, op });
});

test("returns null instead of throwing", async () => {
  const env = await encryptOp(docId, k, addOp);
  expect(await decryptOp(newDocId(), k, env)).toBeNull();
  expect(await decryptOp(docId, await importDocKey(newDocKey()), env)).toBeNull();
  expect(await decryptOp(docId, k, { ...env, id: newOpId() })).toBeNull();
  expect(await decryptOp(docId, k, { ...env, c: "%%%" })).toBeNull();
  expect(await decryptOp(docId, k, { foo: 1 })).toBeNull();
  expect(await decryptOp(docId, k, null)).toBeNull();
});

test("rejects decrypted json that violates the op schema", async () => {
  const opId = newOpId();
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode(`${docId}:${opId}`), tagLength: 128 },
    k,
    new TextEncoder().encode('{"v":1,"t":"move"}'),
  );
  const forged: Envelope = { id: opId, n: toBase64Url(nonce), c: toBase64Url(new Uint8Array(ct)) };
  expect(await decryptOp(docId, k, forged)).toBeNull();
});

test("refuses to encrypt an invalid op", async () => {
  await expect(encryptOp(docId, k, { ...addOp, text: "" } as Op)).rejects.toThrow(TypeError);
});

test("rejects a malformed key", async () => {
  await expect(importDocKey("tooshort")).rejects.toThrow();
});

test.each([
  ["3-byte characters", "あ"],
  ["quotes (escaped)", '"'],
  ["emoji (surrogate pairs)", "😀"],
])("max-length item text of %s stays under 4 KB", async (_, ch) => {
  const text = ch.repeat(Math.floor(MAX_ITEM_TEXT / ch.length));
  const env = await encryptOp(docId, k, { ...addOp, text });
  expect(envelopeSize(env)).toBeLessThanOrEqual(4096);
});

test("EnvelopeTooLargeError is exported for callers", () => {
  expect(new EnvelopeTooLargeError(5000)).toBeInstanceOf(Error);
});

type Vector = { docId: string; key: string; opId: string; nonce: string; op: Op; envelope: Envelope };
const vectors = JSON.parse(readFileSync(new URL("./vectors/aes-gcm.json", import.meta.url), "utf8")) as Vector[];

test("matches the fixed vectors", async () => {
  expect(vectors.length).toBe(3);
  for (const v of vectors) {
    const key = await importDocKey(v.key);
    const env = await encryptOp(v.docId, key, v.op, { opId: v.opId, nonce: fromBase64Url(v.nonce)! });
    expect(env).toEqual(v.envelope);
    expect(await decryptOp(v.docId, key, v.envelope)).toEqual({ opId: v.opId, op: v.op });
  }
});
