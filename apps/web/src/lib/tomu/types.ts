import type { Envelope, LabelState, ListState } from "@tomu/shared";

/** own: created here; link: opened via a single link; label: only reachable via shared labels. */
export type Origin = "own" | "link" | "label";

export type DocBase = {
  id: string;
  key: string;
  origin: Origin;
  /** Known to exist on the server; false only for own docs before POST. */
  created: boolean;
  /** Server said not_found for a foreign doc. */
  missing: boolean;
  /** Server said too_large (doc reached 50,000 ops). */
  full: boolean;
  lastSeq: number;
  /** Private label ids (lists only). */
  labels: string[];
  /** Lists only. */
  folder: string | null;
};

export type DocRecord = DocBase &
  ({ kind: null; state: null } | { kind: "list"; state: ListState } | { kind: "label"; state: LabelState });

/** `n` is autoincrement and gives FIFO order. */
export type OutboxEntry = { n: number; doc: string; env: Envelope };

/** Private label; id from newDocId(). */
export type LocalLabel = { id: string; name: string };
export type Folder = { id: string; name: string };
export type Settings = { clientId: string; displayName: string; largeView: boolean; clockLast: number; onboarded: boolean };

export type Change = {
  putDocs?: DocRecord[];
  deleteDocs?: string[];
  addOutbox?: { doc: string; env: Envelope }[];
  removeOutbox?: { doc: string; id: string }[];
  clearOutbox?: string[];
  addTombstones?: string[];
  putLabels?: LocalLabel[];
  deleteLabels?: string[];
  putFolders?: Folder[];
  deleteFolders?: string[];
  settings?: Partial<Settings>;
};

export type Snapshot = {
  docs: DocRecord[];
  outbox: OutboxEntry[];
  tombstones: Set<string>;
  labels: LocalLabel[];
  folders: Folder[];
  settings: Settings;
};

export type SyncStatus = "offline" | "syncing" | "synced" | "blocked";
