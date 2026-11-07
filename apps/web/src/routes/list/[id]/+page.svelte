<script lang="ts">
  import { page } from "$app/state";
  import { flip } from "svelte/animate";
  import { cubicIn } from "svelte/easing";
  import AddField from "#lib/app/components/AddField.svelte";
  import Board from "#lib/app/components/Board.svelte";
  import InstallHint from "#lib/app/components/InstallHint.svelte";
  import ItemDialog from "#lib/app/components/ItemDialog.svelte";
  import ListMenu from "#lib/app/components/ListMenu.svelte";
  import ItemRow from "#lib/app/components/ItemRow.svelte";
  import LabelTag from "#lib/app/components/LabelTag.svelte";
  import Sheet from "#lib/app/components/Sheet.svelte";
  import StatusBadge from "#lib/app/components/StatusBadge.svelte";
  import { getPending, getTomu } from "#lib/app/context.ts";
  import { FreshItems } from "#lib/app/fresh.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  const tomu = getTomu();
  const id = $derived(page.params.id ?? "");
  const pending = getPending();
  const view = $derived(tomu.list(id));
  const status = $derived(tomu.docStatus(id));
  const info = $derived(tomu.lists.find((l) => l.id === id));
  const labels = $derived(info ? tomu.labels.filter((l) => info.labelIds.includes(l.id)) : []);
  // Entries waiting for their undo window are not shown.
  const hidden = $derived(pending.hidden(id));
  const items = $derived((view?.items ?? []).filter((i) => !hidden.has(i.id)));
  const count = $derived(items.filter((i) => !i.checked).length);
  const doneCount = $derived(items.length - count);

  // One marker per opened list.
  const fresh = $derived.by(() => {
    void id;
    return new FreshItems();
  });
  $effect(() => {
    const f = fresh;
    return () => f.dispose();
  });
  $effect(() => {
    if (view) fresh.see(view.items.map((i) => i.id));
  });

  // Sliding below the perforation is the only motion on this screen; reduced motion shows the end state.
  const reduceMotion = (): boolean =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // A list deleted elsewhere takes its waiting undo with it.
  $effect(() => {
    if (status === "gone") pending.drop(id);
  });

  let editId = $state<string | null>(null);
  let editOpen = $state(false);
  const editing = $derived(view?.items.find((i) => i.id === editId) ?? null);
  $effect(() => {
    if (editOpen && !editing) editOpen = false;
  });

  const deleteAll = async (listId: string, ids: string[]): Promise<void> => {
    for (const itemId of ids) await tomu.deleteItem(listId, itemId);
  };

  // The one place that removes a single entry: it waits in the undo bar first.
  const removeItem = (itemId: string): void => {
    const listId = id; // the page may be left before the window ends
    pending.schedule(listId, [itemId], (ids) => deleteAll(listId, ids));
  };

  // The ticked part leaves by tearing off below the perforation; reduced motion removes it at once.
  const motion = { tearing: false };
  const tearDuration = 450;
  const tear = (_node: Element, { duration }: { duration: number }) => ({
    duration,
    easing: cubicIn,
    css: (t: number, u: number) =>
      `transform: translateY(${u * 2.5}rem) rotate(${u * 3}deg); opacity: ${t}; transform-origin: 0 0;`,
  });

  // Only entries ticked right now go; one that someone unticked before the window ended stays.
  function tearOff(): void {
    const ids = items.filter((i) => i.checked).map((i) => i.id);
    if (ids.length === 0) return;
    const listId = id;
    motion.tearing = !reduceMotion();
    setTimeout(() => (motion.tearing = false), tearDuration + 100);
    pending.schedule(listId, ids, (all) =>
      deleteAll(
        listId,
        all.filter((itemId) => tomu.list(listId)?.items.some((i) => i.id === itemId && i.checked)),
      ),
    );
  }
</script>

<Board>
  {#snippet start()}
    <a class="back" href="/">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="square"
      >
        <path d="M15 4l-8 8 8 8" />
      </svg>
      {m.back_to_lists()}
    </a>
  {/snippet}
  {#snippet end()}
    <StatusBadge status={tomu.status} />
    {#if info}<ListMenu listId={id} />{/if}
  {/snippet}
</Board>

<Sheet offline={tomu.status === "offline"}>
  {#if view}
    {#if labels.length > 0}
      <div class="labels">
        {#each labels as label (label.id)}<LabelTag {label} plain />{/each}
      </div>
    {/if}
    <div class="head">
      <h1 class="title">{view.title}</h1>
      <p class="open" class:top={view.title.length > 24}>
        <span class="count">{count}</span>
        <span class="open-label">{m.open_label()}</span>
      </p>
    </div>
    <div class="rule"></div>
    <AddField listId={id} {fresh} />
    <InstallHint />
    <ul>
      {#each items as item, i (item.id)}
        <li
          animate:flip={{ duration: reduceMotion() ? 0 : 250 }}
          out:tear={{ duration: motion.tearing ? tearDuration : 0 }}
        >
          {#if item.checked && i === count}
            <div class="perf"><span>{m.done_count({ count: doneCount })}</span></div>
          {/if}
          <ItemRow
            {item}
            fresh={fresh.isFresh(item.id)}
            onToggle={() => void tomu.setChecked(id, item.id, !item.checked)}
            onEdit={() => {
              editId = item.id;
              editOpen = true;
            }}
          />
        </li>
      {/each}
    </ul>
    {#if doneCount > 0}
      <button type="button" class="tear" onclick={tearOff}>{m.tear_off()}</button>
    {/if}
  {:else if status === "loading"}
    <p class="note">{tomu.status === "offline" ? m.list_waiting_offline() : m.list_loading()}</p>
  {:else}
    <p class="note">{status === "gone" ? m.list_gone() : m.list_missing()}</p>
  {/if}
</Sheet>

<ItemDialog
  bind:open={editOpen}
  item={editing}
  onSave={(text) => (editId ? tomu.editItem(id, editId, text) : Promise.resolve())}
  onDelete={() => (editId ? removeItem(editId) : undefined)}
/>

<style>
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-height: var(--tap);
    padding-right: 0.5rem;
    color: inherit;
    font-size: 1.15rem;
    font-weight: 700;
    text-decoration: none;
  }
  .labels {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 1rem;
  }
  .head {
    container-type: inline-size;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-top: 0.5rem;
  }
  .title {
    flex: 1 1 10rem;
    min-width: 0;
    margin: 0;
    font-size: 2rem;
    line-height: 1.1;
    overflow-wrap: anywhere;
    hyphens: auto;
  }
  .open {
    flex: none;
    margin: 0;
    text-align: right;
  }
  /* A long title grows downwards; the count stays at the top, in view. */
  .open.top {
    align-self: flex-start;
  }
  /* Too narrow for title and count side by side: the count takes its own line above. */
  @container (max-width: 18rem) {
    .open {
      order: -1;
      flex-basis: 100%;
      text-align: left;
    }
  }
  .count {
    display: block;
    font-family: var(--font-count);
    font-stretch: 70%;
    font-weight: 900;
    font-size: clamp(5rem, 28vw, 7rem);
    line-height: 0.8;
    letter-spacing: -0.02em;
    color: var(--open);
  }
  .open-label {
    display: block;
    margin-top: 0.3rem;
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--open);
  }
  .rule {
    height: 4px;
    margin-top: 0.9rem;
    background: var(--rule);
  }
  ul {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
  }
  .perf {
    position: relative;
    margin: 1.1rem -1.25rem 0;
    border-top: 3px dashed var(--perf);
  }
  .perf span {
    position: absolute;
    right: 1.25rem;
    top: -0.9rem;
    padding: 0 0.5rem;
    background: var(--sheet);
    color: var(--ink-soft);
    font-size: 1rem;
    font-weight: 700;
  }
  .perf + :global(*) {
    margin-top: 0.6rem;
  }
  .tear {
    display: block;
    width: 100%;
    min-height: 3.75rem;
    margin: 1rem 0 0;
    padding: 0 1.25rem;
    text-align: center;
    font-size: 1.15rem;
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .note {
    margin: 2rem 0;
    font-size: 1.5rem;
    line-height: 1.3;
  }
</style>
