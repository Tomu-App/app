import type { Folder, LabelInfo, ListInfo, ListView } from "#lib/tomu/index.js";

/** Number of entries not yet checked off; 0 while the list content is unknown. */
export const openCount = (view: ListView | null): number => view?.items.filter((i) => !i.checked).length ?? 0;

/**
 * Lists without folder first, then folders by name; empty groups are dropped. Lists keep the order they come in
 * (`tomu.lists` is sorted by rank), so the overview order is the user's own.
 */
export function groupLists(
  lists: ListInfo[],
  folders: Folder[],
  locale: string,
): { folder: Folder | null; lists: ListInfo[] }[] {
  const known = new Set(folders.map((f) => f.id));
  const groups = [
    {
      folder: null as Folder | null,
      lists: lists.filter((l) => l.folderId === null || !known.has(l.folderId)),
    },
    ...[...folders]
      .sort((a, b) => a.name.localeCompare(b.name, locale))
      .map((folder) => ({
        folder: folder as Folder | null,
        lists: lists.filter((l) => l.folderId === folder.id),
      })),
  ];
  return groups.filter((g) => g.lists.length > 0);
}

/** "Lisa / Familie" for foreign shared labels, else the plain name. */
export const labelText = (l: LabelInfo): string => (l.owner !== null ? `${l.owner} / ${l.name}` : l.name);

/** Only own labels can be renamed. */
export const canRename = (l: LabelInfo): boolean => l.owner === null;
