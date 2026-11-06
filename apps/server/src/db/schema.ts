import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/** Lists and shared labels alike; the server cannot tell them apart. */
export const docs = sqliteTable("docs", {
  id: text("id").primaryKey(),
  createdAt: integer("created_at").notNull(),
  lastActivityAt: integer("last_activity_at").notNull(),
});

export const ops = sqliteTable(
  "ops",
  {
    docId: text("doc_id")
      .notNull()
      .references(() => docs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    opId: text("op_id").notNull(),
    /** The envelope `{id, n, c}` as JSON. */
    envelope: text("envelope").notNull(),
    receivedAt: integer("received_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.docId, t.seq] }), uniqueIndex("ops_doc_op_id").on(t.docId, t.opId)],
);
