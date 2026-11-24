<script lang="ts">
  import { MAX_ITEM_TEXT } from "@tomu/shared";
  import { getTomu } from "#lib/app/context.ts";
  import type { FreshItems } from "#lib/app/fresh.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { cleanMultiline } from "#lib/tomu/items.ts";

  let { listId, fresh }: { listId: string; fresh: FreshItems } = $props();

  const tomu = getTomu();
  let value = $state("");
  // Measured like the edit dialog: on the cleaned text, line breaks included.
  const tooLong = $derived(cleanMultiline(value).length > MAX_ITEM_TEXT);
  let busy = false;
  let el: HTMLTextAreaElement;

  /** Puts the cursor in the field, e.g. when the list below it has just been emptied. */
  export function focus(): void {
    el.focus();
  }

  // One submit is one entry: the text is never split, line breaks stay.
  async function submit(e?: Event): Promise<void> {
    e?.preventDefault();
    const text = value;
    if (busy || tooLong || cleanMultiline(text) === "") {
      el.focus();
      return;
    }
    busy = true;
    try {
      const id = await tomu.addItem(listId, text);
      if (id) fresh.own([id]);
      if (value === text) value = "";
    } finally {
      busy = false;
      el.focus();
    }
  }

  // Enter is a line break; Ctrl+Enter (Cmd+Enter on macOS) adds, like the "+" button.
  function onkeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.isComposing) void submit(e);
  }
</script>

<form class="add" onsubmit={submit}>
  <textarea
    bind:this={el}
    bind:value
    {onkeydown}
    rows="1"
    autocomplete="off"
    aria-label={m.add_label()}
    aria-describedby="add-hint"
    placeholder={m.add_placeholder()}></textarea>
  <button type="submit" class="plus" aria-label={m.add_button()}>
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="28"
      height="28"
      fill="none"
      stroke="currentColor"
      stroke-width="4"
      stroke-linecap="square"
    >
      <path d="M12 4v16M4 12h16" />
    </svg>
  </button>
</form>
<p id="add-hint" class="hint" role="status">
  {#if tooLong}{m.item_too_long()}{/if}
</p>

<style>
  .add {
    display: flex;
    gap: 0.6rem;
    margin-top: 1rem;
  }
  textarea {
    flex: 1;
    min-width: 0;
    min-height: 3.75rem;
    max-height: 10rem;
    padding: 0.85rem 0.8rem;
    border: 3px solid var(--field-line);
    border-radius: var(--radius);
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 1.2rem;
    line-height: 1.3;
    resize: none;
    field-sizing: content;
  }
  textarea::placeholder {
    color: var(--ink-soft);
    opacity: 1;
  }
  .plus {
    flex: none;
    display: grid;
    place-items: center;
    width: 3.75rem;
    height: 3.75rem;
    border: 0;
    border-radius: var(--radius);
    background: var(--rule);
    color: var(--sheet);
    cursor: pointer;
  }
  .hint {
    margin: 0.4rem 0 0;
    min-height: 0;
    font-weight: 700;
  }
  .hint:empty {
    display: none;
  }
</style>
