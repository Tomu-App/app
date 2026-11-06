import { fromBase64Url, randomBytes, toBase64Url } from "./encoding.ts";
import { newOpId } from "./ids.ts";
import { envelopeSchema, envelopeSize, MAX_ENVELOPE_BYTES, type Envelope } from "./schemas/envelope.ts";
import { opSchema, type Op } from "./schemas/ops.ts";

const NONCE_BYTES = 12;
const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder("utf-8", { fatal: true });

export class EnvelopeTooLargeError extends Error {
  readonly size: number;
  constructor(size: number) {
    super(`envelope is ${size} bytes, limit is ${MAX_ENVELOPE_BYTES}`);
    this.size = size;
    this.name = "EnvelopeTooLargeError";
  }
}

/** Imports a document key (43 characters base64url, 32 bytes) for AES-256-GCM. Throws on a malformed key. */
export async function importDocKey(key: string): Promise<CryptoKey> {
  const raw = fromBase64Url(key);
  if (!raw || raw.length !== 32) throw new TypeError("document key must be 32 bytes base64url");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

// AAD binds the ciphertext to its document and op id, so the server cannot move or relabel ops.
const aad = (docId: string, opId: string) => utf8.encode(`${docId}:${opId}`);

/** Encrypts one op for a document. `opts` exists for fixed test vectors; production code omits it. */
export async function encryptOp(
  docId: string,
  key: CryptoKey,
  op: Op,
  opts: { opId?: string; nonce?: Uint8Array<ArrayBuffer> } = {},
): Promise<Envelope> {
  const parsed = opSchema.safeParse(op);
  if (!parsed.success) throw new TypeError(`invalid op: ${parsed.error.message}`);
  const opId = opts.opId ?? newOpId();
  const nonce = opts.nonce ?? randomBytes(NONCE_BYTES);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad(docId, opId), tagLength: 128 },
    key,
    utf8.encode(JSON.stringify(parsed.data)),
  );
  const envelope: Envelope = { id: opId, n: toBase64Url(nonce), c: toBase64Url(new Uint8Array(ct)) };
  const size = envelopeSize(envelope);
  if (size > MAX_ENVELOPE_BYTES) throw new EnvelopeTooLargeError(size);
  return envelope;
}

/** Decrypts and validates one envelope. Returns null for anything that is not a valid op of this document; never throws. */
export async function decryptOp(
  docId: string,
  key: CryptoKey,
  envelope: unknown,
): Promise<{ opId: string; op: Op } | null> {
  try {
    const env = envelopeSchema.safeParse(envelope);
    if (!env.success) return null;
    const nonce = fromBase64Url(env.data.n);
    const ct = fromBase64Url(env.data.c);
    if (!nonce || nonce.length !== NONCE_BYTES || !ct) return null;
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: nonce, additionalData: aad(docId, env.data.id), tagLength: 128 },
      key,
      ct,
    );
    const op = opSchema.safeParse(JSON.parse(fromUtf8.decode(plain)));
    return op.success ? { opId: env.data.id, op: op.data } : null;
  } catch {
    return null;
  }
}
