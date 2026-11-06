import { z } from "zod";
import { CLIENT_ID_RE, DOC_ID_RE, DOC_KEY_RE, OP_ID_RE } from "../ids.ts";

// Own limits so one op always fits into a 4 KB envelope (spec: "Max. Größe einer Envelope 4 KB").
export const MAX_ITEM_TEXT = 1000;
export const MAX_TITLE = 200;
export const MAX_LABEL_NAME = 100;
export const MAX_OWNER = 50;
export const MAX_SEEN = 100;

const text = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) => s.trim().length > 0, "empty");

const base = {
  v: z.literal(1),
  c: z.string().regex(CLIENT_ID_RE),
  ts: z.number().int().nonnegative(),
};
const item = z.uuid();

const init = z.object({ ...base, t: z.literal("init"), kind: z.enum(["list", "label"]) });
const title = z.object({ ...base, t: z.literal("title"), text: text(MAX_TITLE) });
const drop = z.object({ ...base, t: z.literal("drop") });
const add = z.object({ ...base, t: z.literal("add"), item, text: text(MAX_ITEM_TEXT) });
const editText = z.object({ ...base, t: z.literal("text"), item, text: text(MAX_ITEM_TEXT) });
const check = z.object({ ...base, t: z.literal("check"), item, value: z.boolean() });
const del = z.object({ ...base, t: z.literal("del"), item });
const meta = z.object({ ...base, t: z.literal("meta"), name: text(MAX_LABEL_NAME), owner: text(MAX_OWNER) });
const link = z.object({
  ...base,
  t: z.literal("link"),
  list: z.string().regex(DOC_ID_RE),
  key: z.string().regex(DOC_KEY_RE),
});
const unlink = z.object({
  ...base,
  t: z.literal("unlink"),
  list: z.string().regex(DOC_ID_RE),
  seen: z.array(z.string().regex(OP_ID_RE)).max(MAX_SEEN),
});

export const listOpSchema = z.discriminatedUnion("t", [init, title, drop, add, editText, check, del]);
export const labelOpSchema = z.discriminatedUnion("t", [init, meta, link, unlink]);
export const opSchema = z.discriminatedUnion("t", [init, title, drop, add, editText, check, del, meta, link, unlink]);

export type ListOp = z.infer<typeof listOpSchema>;
export type LabelOp = z.infer<typeof labelOpSchema>;
export type Op = z.infer<typeof opSchema>;
