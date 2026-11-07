import {
  applyLabelOp,
  applyListOp,
  emptyLabelState,
  emptyListState,
  labelOpSchema,
  listOpSchema,
  type Op,
} from "@tomu/shared";
import type { DocRecord, Origin } from "./types.ts";

/** Which kind of document an op belongs to: `init` says so itself, label-only ops imply a label. */
export function kindOf(op: Op): "list" | "label" {
  if (op.t === "init") return op.kind;
  if (op.t === "meta" || op.t === "link" || op.t === "unlink") return "label";
  return "list";
}

export function newDocRecord(id: string, key: string, origin: Origin, kind: "list" | "label" | null): DocRecord {
  const base = {
    id,
    key,
    origin,
    created: origin !== "own",
    missing: false,
    full: false,
    lastSeq: 0,
    labels: [],
    folder: null,
  };
  if (kind === "list") return { ...base, kind, state: emptyListState() };
  if (kind === "label") return { ...base, kind, state: emptyLabelState() };
  return { ...base, kind: null, state: null };
}

/**
 * Applies one op to the record in place and returns it. The first op decides the kind of a record whose kind is
 * still unknown. Ops that are invalid or of the other kind are ignored.
 */
export function applyToDoc(rec: DocRecord, opId: string, op: Op): DocRecord {
  if (rec.kind === null) {
    const kind = kindOf(op);
    Object.assign(rec, kind === "list" ? { kind, state: emptyListState() } : { kind, state: emptyLabelState() });
  }
  if (rec.kind === "list") {
    const parsed = listOpSchema.safeParse(op);
    if (parsed.success) applyListOp(rec.state, opId, parsed.data);
    else console.warn(`ignored op not valid for a list (doc ${rec.id})`);
  } else if (rec.kind === "label") {
    const parsed = labelOpSchema.safeParse(op);
    if (parsed.success) applyLabelOp(rec.state, opId, parsed.data);
    else console.warn(`ignored op not valid for a label (doc ${rec.id})`);
  }
  return rec;
}

export function isDropped(rec: DocRecord): boolean {
  return rec.kind === "list" && rec.state.dropped;
}
