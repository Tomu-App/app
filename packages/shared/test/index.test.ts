import { expect, test } from "vitest";
import * as shared from "../src/index.ts";
import {
  applyLabelOp,
  applyListOp,
  buildLink,
  Clock,
  decryptOp,
  emptyLabelState,
  emptyListState,
  encryptOp,
  importDocKey,
  labelMembers,
  labelOpSchema,
  listOpSchema,
  listView,
  newClientId,
  newDocId,
  newDocKey,
  parseLink,
  type Envelope,
  type LabelOp,
  type ListOp,
} from "../src/index.ts";

test("exports the documented API", () => {
  for (const name of [
    "toBase64Url", "fromBase64Url", "randomBytes", "newDocId", "newDocKey", "newOpId", "newClientId",
    "DOC_ID_RE", "DOC_KEY_RE", "OP_ID_RE", "CLIENT_ID_RE",
    "buildLink", "parseLink", "LINK_ORIGIN",
    "opSchema", "listOpSchema", "labelOpSchema", "envelopeSchema", "envelopeSize", "MAX_ENVELOPE_BYTES",
    "clientMessageSchema", "serverMessageSchema", "opsPageSchema",
    "importDocKey", "encryptOp", "decryptOp", "EnvelopeTooLargeError",
    "Clock", "compareStamp",
    "emptyListState", "applyListOp", "listView",
    "emptyLabelState", "applyLabelOp", "labelMembers", "liveLinkIds",
  ]) expect(shared, name).toHaveProperty(name);
});

test("end to end: Lisa shares a label, Mike reads the list", async () => {
  // Lisa's device
  const clock = new Clock(newClientId());
  const listId = newDocId();
  const listKeyRaw = newDocKey();
  const labelId = newDocId();
  const labelKeyRaw = newDocKey();
  const listKey = await importDocKey(listKeyRaw);
  const labelKey = await importDocKey(labelKeyRaw);
  const stamp = () => ({ v: 1 as const, ...clock.next() });

  const listOps: ListOp[] = [
    { ...stamp(), t: "init", kind: "list" },
    { ...stamp(), t: "title", text: "Wochenende" },
    { ...stamp(), t: "add", item: crypto.randomUUID(), text: "Kuchen backen" },
  ];
  const labelOps: LabelOp[] = [
    { ...stamp(), t: "init", kind: "label" },
    { ...stamp(), t: "meta", name: "Familie", owner: "Lisa" },
    { ...stamp(), t: "link", list: listId, key: listKeyRaw },
  ];
  // What the server stores: only envelopes.
  const server = new Map<string, Envelope[]>([
    [listId, await Promise.all(listOps.map((op) => encryptOp(listId, listKey, op)))],
    [labelId, await Promise.all(labelOps.map((op) => encryptOp(labelId, labelKey, op)))],
  ]);
  const shareLink = buildLink(labelId, labelKeyRaw);

  // Mike's device: knows nothing but the link.
  const parsed = parseLink(shareLink)!;
  const mikeLabelKey = await importDocKey(parsed.key);
  const label = emptyLabelState();
  for (const env of server.get(parsed.docId)!) {
    const d = await decryptOp(parsed.docId, mikeLabelKey, env);
    const op = labelOpSchema.safeParse(d?.op);
    if (d && op.success) applyLabelOp(label, d.opId, op.data);
  }
  expect(`${label.owner} / ${label.name}`).toBe("Lisa / Familie");

  const [[memberId, memberKey]] = [...labelMembers(label)] as [[string, string]];
  const list = emptyListState();
  const mikeListKey = await importDocKey(memberKey);
  for (const env of server.get(memberId)!) {
    const d = await decryptOp(memberId, mikeListKey, env);
    const op = listOpSchema.safeParse(d?.op);
    if (d && op.success) applyListOp(list, d.opId, op.data);
  }
  expect(listView(list)).toMatchObject({ title: "Wochenende", items: [{ text: "Kuchen backen", checked: false }] });
});
