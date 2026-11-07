<script lang="ts">
  import type { Snippet } from "svelte";
  import { m } from "#lib/paraglide/messages.js";

  let {
    open = $bindable(false),
    title,
    children,
  }: { open?: boolean; title: string; children?: Snippet } = $props();

  let el: HTMLDialogElement;

  $effect(() => {
    if (open && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    } else if (!open && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  });
</script>

<!-- Escape fires the native close event, which keeps `open` in step. -->
<dialog bind:this={el} aria-labelledby="dialog-title" onclose={() => (open = false)}>
  <div class="head">
    <h2 id="dialog-title">{title}</h2>
    <button type="button" class="x" aria-label={m.dialog_close()} onclick={() => (open = false)}>&times;</button>
  </div>
  {#if open}{@render children?.()}{/if}
</dialog>

<style>
  dialog {
    width: min(100% - 2rem, 34rem);
    max-height: calc(100dvh - 2rem);
    padding: 1.25rem;
    background: var(--sheet);
    color: var(--ink);
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    /* Dialogs lie above the sheet: the one place with a shadow. */
    box-shadow: 0 0.5rem 2rem rgb(0 0 0 / 0.35);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  h2 {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.2;
  }
  .x {
    width: var(--tap);
    height: var(--tap);
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 1.5rem;
    cursor: pointer;
  }
</style>
