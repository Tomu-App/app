<script lang="ts">
  import { getPending } from "#lib/app/context.ts";
  import { m } from "#lib/paraglide/messages.js";

  const pending = getPending();
  const current = $derived(pending.current);
</script>

<div class="bar" role="status">
  {#if current}
    <span class="text">{m.undo_text({ count: current.count })}</span>
    <button type="button" onclick={() => pending.undo()}>{m.undo_button()}</button>
  {/if}
</div>

<style>
  .bar:empty {
    display: none;
  }
  .bar {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem 1rem calc(0.5rem + env(safe-area-inset-bottom));
    background: var(--ink);
    color: var(--sheet);
    font-size: 1.15rem;
    font-weight: 700;
  }
  button {
    min-width: var(--tap);
    min-height: var(--tap);
    padding: 0 1.25rem;
    border: 3px solid var(--sheet);
    border-radius: var(--radius);
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 3px solid var(--sheet);
    outline-offset: 2px;
  }
</style>
