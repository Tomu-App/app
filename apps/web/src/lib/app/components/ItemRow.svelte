<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";

  let {
    item,
    fresh = false,
    onToggle,
    onEdit,
  }: {
    item: { id: string; text: string; checked: boolean };
    fresh?: boolean;
    onToggle: () => void;
    onEdit: () => void;
  } = $props();
</script>

<div class="row" class:done={item.checked}>
  <!-- The whole line ticks; editing has its own button so it never happens by accident. -->
  <button type="button" role="checkbox" aria-checked={item.checked} class="tick" onclick={onToggle}>
    <span class="box" aria-hidden="true">
      {#if item.checked}
        <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="square">
          <path d="M5 12.5l5 5L19 7" />
        </svg>
      {/if}
    </span>
    <span class="text">{item.text}</span>
    {#if fresh}<span class="mark">{m.fresh_mark()}</span>{/if}
  </button>
  <button type="button" class="edit" onclick={onEdit}>
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 20l1-4L16 5l3 3L8 19z" />
      <path d="M14 7l3 3" />
    </svg>
    <span class="sr">{m.item_edit()}: {item.text}</span>
  </button>
</div>

<style>
  .row {
    display: flex;
    align-items: stretch;
    min-height: 4rem;
    border-bottom: 2px solid color-mix(in srgb, var(--perf) 45%, transparent);
  }
  button {
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .tick {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 0;
    text-align: left;
    font-size: 1.35rem;
  }
  .box {
    flex: none;
    width: 2.1rem;
    height: 2.1rem;
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    display: grid;
    place-items: center;
  }
  .text {
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.25;
  }
  .mark {
    flex: none;
    margin-left: auto;
    padding: 0 0.4rem;
    border: 2px solid var(--open);
    border-radius: 4px;
    color: var(--open);
    font-size: 1rem;
    font-weight: 700;
  }
  .done .tick {
    color: var(--ink-soft);
  }
  .done .text {
    text-decoration: line-through;
    text-decoration-thickness: 3px;
  }
  .done .box {
    background: var(--rule);
    color: var(--sheet);
    padding: 0.2rem;
  }
  .edit {
    flex: none;
    align-self: center;
    display: grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    border-radius: var(--radius);
    color: var(--ink-soft);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
</style>
