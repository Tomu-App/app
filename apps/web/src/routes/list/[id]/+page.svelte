<script lang="ts">
  import { page } from "$app/state";
  import { flip } from "svelte/animate";
  import AddField from "#lib/app/components/AddField.svelte";
  import Board from "#lib/app/components/Board.svelte";
  import ItemDialog from "#lib/app/components/ItemDialog.svelte";
  import ItemRow from "#lib/app/components/ItemRow.svelte";
  import LabelTag from "#lib/app/components/LabelTag.svelte";
  import Sheet from "#lib/app/components/Sheet.svelte";
  import StatusBadge from "#lib/app/components/StatusBadge.svelte";
  import { getTomu } from "#lib/app/context.ts";
  import { FreshItems } from "#lib/app/fresh.svelte.ts";
  import { openCount } from "#lib/app/lists.ts";
  import { m } from "#lib/paraglide/messages.js";

  const tomu = getTomu();
  const id = $derived(page.params.id ?? "");
  const view = $derived(tomu.list(id));
  const status = $derived(tomu.docStatus(id));
  const info = $derived(tomu.lists.find((l) => l.id === id));
  const labels = $derived(info ? tomu.labels.filter((l) => info.labelIds.includes(l.id)) : []);
  const count = $derived(openCount(view));
  const doneCount = $derived((view?.items.length ?? 0) - count);

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

  let editId = $state<string | null>(null);
  let editOpen = $state(false);
  const editing = $derived(view?.items.find((i) => i.id === editId) ?? null);
  $effect(() => {
    if (editOpen && !editing) editOpen = false;
  });

  // The one place that removes an entry.
  const removeItem = (itemId: string): Promise<void> => tomu.deleteItem(id, itemId);
</script>

<Board>
  {#snippet start()}
    <a class="back" href="/">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square">
        <path d="M15 4l-8 8 8 8" />
      </svg>
      {m.back_to_lists()}
    </a>
  {/snippet}
  {#snippet end()}
    <StatusBadge status={tomu.status} />
  {/snippet}
</Board>

<Sheet offline={tomu.status === "offline"}>
  {#if view}
    {#if labels.length > 0}
      <div class="labels">{#each labels as label (label.id)}<LabelTag {label} />{/each}</div>
    {/if}
    <div class="head">
      <h1 class="title">{view.title}</h1>
      <p class="open">
        <span class="count">{count}</span>
        <span class="open-label">{m.open_label()}</span>
      </p>
    </div>
    <div class="rule"></div>
    <AddField listId={id} {fresh} />
    <ul>
      {#each view.items as item, i (item.id)}
        <li animate:flip={{ duration: reduceMotion() ? 0 : 250 }}>
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
  {:else if status === "loading"}
    <p class="note">{m.list_loading()}</p>
  {:else}
    <p class="note">{status === "gone" ? m.list_gone_hint() : m.list_missing()}</p>
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
    gap: 0.4rem;
  }
  .head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 0.5rem;
  }
  .title {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 2rem;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }
  .open {
    flex: none;
    margin: 0;
    text-align: right;
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
  .note {
    margin: 2rem 0;
    font-size: 1.5rem;
    line-height: 1.3;
  }
</style>
