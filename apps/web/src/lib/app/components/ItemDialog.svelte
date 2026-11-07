<script lang="ts">
  import { MAX_ITEM_TEXT } from "@tomu/shared";
  import { untrack } from "svelte";
  import { m } from "#lib/paraglide/messages.js";
  import Dialog from "./Dialog.svelte";

  let {
    open = $bindable(false),
    item,
    onSave,
    onDelete,
  }: {
    open?: boolean;
    item: { id: string; text: string } | null;
    onSave: (text: string) => Promise<void>;
    onDelete: () => void | Promise<void>;
  } = $props();

  let text = $state("");
  let busy = $state(false);

  // Fill the field when the dialog opens; a later remote edit must not overwrite what is being typed.
  $effect(() => {
    if (open) text = untrack(() => item?.text ?? "");
  });

  const tooLong = $derived(text.trim().length > MAX_ITEM_TEXT);
  const valid = $derived(text.trim().length > 0 && !tooLong && !busy);

  async function save(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!valid) return;
    busy = true;
    try {
      await onSave(text);
      open = false;
    } finally {
      busy = false;
    }
  }

  async function remove(): Promise<void> {
    await onDelete();
    open = false;
  }
</script>

<Dialog bind:open title={m.item_edit_title()}>
  <form onsubmit={save}>
    <label class="field">
      <span>{m.item_text_field()}</span>
      <textarea bind:value={text} rows="3" aria-describedby="item-hint"></textarea>
    </label>
    <p id="item-hint" class="hint" role="status">{#if tooLong}{m.item_too_long()}{/if}</p>
    <div class="actions">
      <button type="button" class="ghost" onclick={remove}>{m.item_delete()}</button>
      <button type="submit" disabled={!valid}>{m.item_save()}</button>
    </div>
  </form>
</Dialog>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-weight: 700;
  }
  textarea {
    padding: 0.7rem 0.75rem;
    border: 3px solid var(--field-line);
    border-radius: var(--radius);
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-weight: 400;
    resize: vertical;
  }
  .hint {
    margin: 0.4rem 0 0;
    font-weight: 700;
  }
  .hint:empty {
    display: none;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.75rem;
    margin-top: 1rem;
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
