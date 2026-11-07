<script lang="ts">
  import { goto } from "$app/navigation";
  import { getTomu } from "#lib/app/context.ts";
  import { m } from "#lib/paraglide/messages.js";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import Dialog from "./Dialog.svelte";
  import FolderPicker from "./FolderPicker.svelte";
  import LabelPicker from "./LabelPicker.svelte";

  let { listId }: { listId: string } = $props();

  const tomu = getTomu();
  const info = $derived(tomu.lists.find((l) => l.id === listId));
  const own = $derived(info?.origin === "own");

  let open = $state(false);
  let mode = $state<"menu" | "rename" | "labels" | "folder">("menu");
  let confirmOpen = $state(false);
  let title = $state("");
  let busy = $state(false);

  $effect(() => {
    if (!open) mode = "menu";
  });

  const heading = $derived(
    mode === "rename"
      ? m.rename_title()
      : mode === "labels"
        ? m.menu_labels()
        : mode === "folder"
          ? m.menu_folder()
          : m.menu_title(),
  );
  const valid = $derived(title.trim().length > 0 && !busy);

  function show(next: "rename" | "labels" | "folder"): void {
    if (next === "rename") title = info?.title ?? "";
    mode = next;
  }

  async function rename(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!valid) return;
    busy = true;
    try {
      await tomu.renameList(listId, title);
      open = false;
    } finally {
      busy = false;
    }
  }

  // The choice is saved at once; a label that cannot take the list any more leaves the saved state unchanged.
  async function setLabels(ids: string[]): Promise<void> {
    try {
      await tomu.setListLabels(listId, ids);
    } catch {
      // the picker keeps showing the saved state
    }
  }

  async function remove(): Promise<void> {
    await tomu.deleteList(listId);
    await goto("/");
  }
</script>

<button type="button" class="trigger" aria-label={m.menu_open()} onclick={() => (open = true)}>
  <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <rect x="3" y="5" width="18" height="3" />
    <rect x="3" y="10.5" width="18" height="3" />
    <rect x="3" y="16" width="18" height="3" />
  </svg>
</button>

<Dialog bind:open title={heading}>
  {#if mode === "menu"}
    <ul class="rows">
      <li>
        <a class="row" href={`/list/${listId}/share`} onclick={() => (open = false)}>{m.menu_share()}</a>
      </li>
      <li><button type="button" class="row" onclick={() => show("rename")}>{m.menu_rename()}</button></li>
      <li><button type="button" class="row" onclick={() => show("labels")}>{m.menu_labels()}</button></li>
      <li><button type="button" class="row" onclick={() => show("folder")}>{m.menu_folder()}</button></li>
      {#if own}
        <li>
          <button
            type="button"
            class="row"
            onclick={() => {
              open = false;
              confirmOpen = true;
            }}>{m.menu_delete()}</button
          >
        </li>
      {/if}
    </ul>
  {:else if mode === "rename"}
    <form onsubmit={rename}>
      <label class="field">
        <span>{m.new_list_title_field()}</span>
        <input type="text" bind:value={title} maxlength="120" autocomplete="off" />
      </label>
      <div class="actions">
        <button type="button" onclick={() => (mode = "menu")}>{m.menu_back()}</button>
        <button type="submit" class="solid" disabled={!valid}>{m.new_list_save()}</button>
      </div>
    </form>
  {:else}
    {#if mode === "labels"}
      <LabelPicker
        selected={info?.labelIds ?? []}
        existingList={true}
        onChange={(ids) => void setLabels(ids)}
      />
    {:else}
      <FolderPicker
        selected={info?.folderId ?? null}
        onChange={(id) => void tomu.setListFolder(listId, id)}
      />
    {/if}
    <div class="actions">
      <button type="button" onclick={() => (mode = "menu")}>{m.menu_back()}</button>
    </div>
  {/if}
</Dialog>

<ConfirmDialog
  bind:open={confirmOpen}
  title={m.delete_list_title()}
  body={m.delete_list_body()}
  confirmLabel={m.delete_list_confirm()}
  onConfirm={remove}
/>

<style>
  .trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--tap);
    height: var(--tap);
    padding: 0;
    border: 3px solid currentColor;
    border-radius: var(--radius);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .row {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    width: 100%;
    min-height: 3.5rem;
    padding: 0 0.5rem;
    border: 0;
    border-bottom: 2px solid var(--perf);
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 1.25rem;
    font-weight: 700;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 1rem;
    font-weight: 700;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.75rem;
  }
  .actions button {
    min-width: var(--tap);
    min-height: var(--tap);
    padding: 0 1.25rem;
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .actions button.solid {
    background: var(--rule);
    color: var(--sheet);
  }
  .actions button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
