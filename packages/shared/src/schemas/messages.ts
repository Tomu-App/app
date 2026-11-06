import { z } from "zod";
import { DOC_ID_RE } from "../ids.ts";
import { envelopeSchema } from "./envelope.ts";

const doc = z.string().regex(DOC_ID_RE);
const seq = z.number().int().nonnegative();
const sequenced = envelopeSchema.extend({ seq });

export const MAX_SUBSCRIBE = 500;

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscribe"), docs: z.array(z.object({ doc, since: seq })).max(MAX_SUBSCRIBE) }),
  z.object({ type: z.literal("unsubscribe"), docs: z.array(doc).max(MAX_SUBSCRIBE) }),
  z.object({ type: z.literal("op"), doc, op: envelopeSchema }),
  z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ops"), doc, ops: z.array(sequenced), head: seq }),
  z.object({ type: z.literal("op"), doc, seq, op: envelopeSchema }),
  z.object({ type: z.literal("ack"), doc, id: envelopeSchema.shape.id, seq }),
  z.object({ type: z.literal("pong") }),
  z.object({
    type: z.literal("error"),
    doc: doc.optional(),
    code: z.enum(["too_large", "rate_limited", "not_found", "invalid"]),
    message: z.string(),
  }),
  z.object({ type: z.literal("presence"), doc, count: z.number().int().nonnegative() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** Response of `GET /api/docs/:id/ops`. */
export const opsPageSchema = z.object({ ops: z.array(sequenced), head: seq });
export type OpsPage = z.infer<typeof opsPageSchema>;
