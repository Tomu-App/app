<script lang="ts">
  import { MAX_TITLE } from "@tomu/shared";
  import { goto } from "$app/navigation";
  import { getTomu } from "#lib/app/context.ts";
  import { m } from "#lib/paraglide/messages.js";
  import Dialog from "./Dialog.svelte";
  import FolderPicker from "./FolderPicker.svelte";
  import LabelPicker from "./LabelPicker.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const tomu = getTomu();
  let title = $state("");
  let labelIds = $state<string[]>([]);
  let folderId = $state<string | null>(null);
  let busy = $state(false);

  $effect(() => {
    if (open) {
      title = "";
      labelIds = [];
      folderId = null;
    }
  });

  const valid = $derived(title.trim().length > 0 && !busy);

  async function save(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!valid) return;
    busy = true;
    try {
      const id = await tomu.createList(title, labelIds, folderId);
      open = false;
      await goto(`/list/${id}`);
    } finally {
      busy = false;
    }
  }
</script>

<Dialog bind:open title={m.new_list()}>
  <form onsubmit={save}>
    <label class="field">
      <span>{m.new_list_title_field()}</span>
      <input type="text" bind:value={title} maxlength={MAX_TITLE} autocomplete="off" />
    </label>
    <LabelPicker selected={labelIds} existingList={false} onChange={(ids) => (labelIds = ids)} />
    <FolderPicker selected={folderId} onChange={(id) => (folderId = id)} />
    <div class="actions">
      <button type="button" class="ghost" onclick={() => (open = false)}>{m.new_list_cancel()}</button>
      <button type="submit" disabled={!valid}>{m.new_list_save()}</button>
    </div>
  </form>
</Dialog>

<style>
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
  button {
    min-width: var(--tap);
    min-height: var(--tap);
    padding: 0 1.25rem;
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    background: var(--rule);
    color: var(--sheet);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  button.ghost {
    background: transparent;
    color: var(--ink);
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>
