<script lang="ts">
  import {
    dragHandle,
    dragHandleZone,
    SHADOW_ITEM_MARKER_PROPERTY_NAME,
    SOURCES,
    TRIGGERS,
    type DndEvent,
  } from "@lukez/svelte-dnd";
  import { flip } from "svelte/animate";
  import Board from "#lib/app/components/Board.svelte";
  import ListRow from "#lib/app/components/ListRow.svelte";
  import Logo from "#lib/app/components/Logo.svelte";
  import NewListDialog from "#lib/app/components/NewListDialog.svelte";
  import Sheet from "#lib/app/components/Sheet.svelte";
  import StatusBadge from "#lib/app/components/StatusBadge.svelte";
  import { getTomu } from "#lib/app/context.ts";
  import { groupLists } from "#lib/app/lists.ts";
  import { FLIP_MS, reduceMotion } from "#lib/app/motion.ts";
  import { pageTitle } from "#lib/app/title.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import type { ListInfo } from "#lib/tomu/index.js";

  const tomu = getTomu();
  let creating = $state(false);
  const groups = $derived(groupLists(tomu.lists, tomu.folders, getLocale()));

  // One drag zone per group, so a list never changes its folder by dragging.
  const keyOf = (folder: { id: string } | null): string => folder?.id ?? "none";
  // While a group is held it shows the library's order; changes from elsewhere reach it after the drop.
  let held = $state.raw<Record<string, ListInfo[] | null>>({});
  const hold = (key: string, lists: ListInfo[] | null): void => {
    held = { ...held, [key]: lists };
  };

  // The placeholder where the held list will land; the library marks it on the item.
  const isSlot = (list: ListInfo): boolean =>
    (list as ListInfo & { [SHADOW_ITEM_MARKER_PROPERTY_NAME]?: boolean })[
      SHADOW_ITEM_MARKER_PROPERTY_NAME
    ] === true;

  // Saved once per drag. Lists that went away during the drag are skipped; if saving fails the saved order shows again.
  async function drop(key: string, e: DndEvent<ListInfo>): Promise<void> {
    const live = new Set(tomu.lists.map((l) => l.id));
    try {
      await tomu.reorderLists(e.items.filter((l) => live.has(l.id)).map((l) => l.id));
    } catch (err) {
      console.warn("could not save the list order", err);
    } finally {
      hold(key, null);
    }
  }

  // The held list lifts off the sheet. `scale`, not `transform`: the library moves the element with `transform`.
  const lift = (el?: HTMLElement): void => {
    if (!el) return;
    el.style.boxShadow = "var(--lift)";
    el.style.background = "var(--sheet)";
    el.style.scale = "1.02";
  };

  const zone = (key: string, shown: () => ListInfo[]) =>
    dragHandleZone<ListInfo>(() => ({
      items: shown(),
      type: key,
      flipDurationMs: reduceMotion() ? 0 : FLIP_MS,
      // Up and down only: the held list never wanders sideways.
      lockAxis: "y",
      // The library reshapes the held list to its slot on every update and measures it with the 1.02 lift
      // included, so the list crept sideways (towards the grip) with each step. Both are the same size anyway.
      morphDisabled: true,
      // Touch must rest 400ms on the grip before the list lifts, so a slow scroll that ends on the grip moves
      // nothing. The grip itself never scrolls the page (the library takes its touches); the rest of the row does.
      delayTouchStart: 400,
      // The default outline is not part of the sheet; the lifted list shows the drag.
      dropTargetStyle: {},
      transformDraggedElement: lift,
      onconsider: (e) => {
        hold(key, [...e.items]);
        // A keyboard drag moves the list on every arrow key and ends here.
        if (e.info.trigger === TRIGGERS.DRAG_STOPPED) void drop(key, e);
      },
      onfinalize: (e) => {
        hold(key, [...e.items]);
        if (e.info.source === SOURCES.POINTER) void drop(key, e);
      },
    }));
</script>

<svelte:head><title>{pageTitle()}</title></svelte:head>

<Board>
  {#snippet start()}<Logo />{/snippet}
  {#snippet end()}
    <StatusBadge status={tomu.status} />
    <a class="icon" href="/labels" aria-label={m.labels_share_button()}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.59 13.51 6.83 3.98" />
        <path d="m15.41 6.51-6.82 3.98" />
      </svg>
    </a>
    <a class="icon" href="/settings" aria-label={m.settings_button()}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M11 10.27 7 3.34" />
        <path d="m11 13.73-4 6.93" />
        <path d="M12 22v-2" />
        <path d="M12 2v2" />
        <path d="M14 12h8" />
        <path d="m17 20.66-1-1.73" />
        <path d="m17 3.34-1 1.73" />
        <path d="M2 12h2" />
        <path d="m20.66 17-1.73-1" />
        <path d="m20.66 7-1.73 1" />
        <path d="m3.34 17 1.73-1" />
        <path d="m3.34 7 1.73 1" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="12" r="8" />
      </svg>
    </a>
  {/snippet}
</Board>

<Sheet offline={tomu.status === "offline"}>
  <h1 class="sr">{m.overview_title()}</h1>
  {#if groups.length === 0}
    <p class="empty">{m.overview_empty()}</p>
  {:else}
    {#each groups as group (keyOf(group.folder))}
      {@const key = keyOf(group.folder)}
      <section>
        {#if group.folder}<h2>{group.folder.name}</h2>{/if}
        <ul
          aria-label={group.folder?.name ?? m.overview_title()}
          {@attach zone(key, () => held[key] ?? group.lists)}
        >
          {#each held[key] ?? group.lists as list (list.id)}
            <li
              aria-label={list.title}
              class:drop-slot={isSlot(list)}
              animate:flip={{ duration: reduceMotion() ? 0 : FLIP_MS }}
            >
              <ListRow {list} handle={dragHandle} />
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
  <button type="button" class="new" onclick={() => (creating = true)}>{m.new_list()}</button>
</Sheet>

<NewListDialog bind:open={creating} />

<style>
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: var(--tap);
    height: var(--tap);
    border: 3px solid currentColor;
    border-radius: var(--radius);
    color: inherit;
  }
  .empty {
    margin: 2rem 0;
    font-size: 1.5rem;
    line-height: 1.3;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  h2 {
    margin: 1.5rem 0 0;
    font-size: 1.125rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--board-text);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .new {
    display: block;
    width: 100%;
    min-height: 4rem;
    margin-top: 2rem;
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    background: var(--rule);
    color: var(--sheet);
    font: inherit;
    font-size: 1.25rem;
    font-weight: 700;
    cursor: pointer;
  }
</style>
