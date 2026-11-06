import { z } from "zod";
import { OP_ID_RE } from "../ids.ts";

export const MAX_ENVELOPE_BYTES = 4096;

const b64url = z.string().regex(/^[A-Za-z0-9_-]+$/);

/** What the server sees of an op: its id, the nonce and ciphertext+tag. */
export const envelopeSchema = z.object({
  id: z.string().regex(OP_ID_RE),
  n: b64url.length(16), // 12-byte nonce
  c: b64url,
});
export type Envelope = z.infer<typeof envelopeSchema>;

/** UTF-8 byte size of the serialized envelope. */
export function envelopeSize(e: Envelope): number {
  return new TextEncoder().encode(JSON.stringify(e)).length;
}
