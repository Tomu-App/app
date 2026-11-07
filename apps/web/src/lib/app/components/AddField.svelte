<script lang="ts">
  import { getTomu } from "#lib/app/context.ts";
  import type { FreshItems } from "#lib/app/fresh.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  let { listId, fresh }: { listId: string; fresh: FreshItems } = $props();

  const tomu = getTomu();
  let value = $state("");
  let tooLong = $state(false);
  let busy = false;
  let el: HTMLTextAreaElement;

  /** Puts the cursor in the field, e.g. when the list below it has just been emptied. */
  export function focus(): void {
    el.focus();
  }

  async function submit(e?: Event): Promise<void> {
    e?.preventDefault();
    const text = value;
    if (busy || text.trim() === "") {
      el.focus();
      return;
    }
    busy = true;
    tooLong = false;
    try {
      const ids = await tomu.addItems(listId, text);
      fresh.own(ids);
      if (value === text) value = "";
    } catch (err) {
      // The text stays in the field; nothing was stored.
      if (err instanceof RangeError) tooLong = true;
      else throw err;
    } finally {
      busy = false;
      el.focus();
    }
  }

  function onkeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) void submit(e);
  }
</script>

<form class="add" onsubmit={submit}>
  <textarea
    bind:this={el}
    bind:value
    {onkeydown}
    oninput={() => (tooLong = false)}
    rows="1"
    enterkeyhint="done"
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
