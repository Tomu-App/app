<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import Dialog from "./Dialog.svelte";

  let {
    open = $bindable(false),
    title,
    body,
    confirmLabel,
    onConfirm,
  }: { open?: boolean; title: string; body: string; confirmLabel: string; onConfirm: () => void | Promise<void> } = $props();

  let busy = $state(false);

  async function confirm(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await onConfirm();
      open = false;
    } finally {
      busy = false;
    }
  }
</script>

<Dialog bind:open {title}>
  <p class="body">{body}</p>
  <div class="actions">
    <button type="button" class="ghost" onclick={() => (open = false)}>{m.confirm_cancel()}</button>
    <button type="button" disabled={busy} onclick={confirm}>{confirmLabel}</button>
  </div>
</Dialog>

<style>
  .body {
    margin: 0 0 1.25rem;
    font-size: 1.15rem;
    line-height: 1.4;
  }
  .actions {
    display: flex;
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
