<script lang="ts">
  import type { SyncStatus } from "#lib/tomu/index.js";
  import { m } from "#lib/paraglide/messages.js";

  let { status }: { status: SyncStatus } = $props();
  const offline = $derived(status === "offline");
</script>

<span class="badge" class:offline role="status">
  <i aria-hidden="true"></i>
  <span>{offline ? m.status_offline() : m.status_synced()}</span>
  {#if offline}<span class="sr">, {m.status_offline_hint()}</span>{/if}
</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
    color: inherit;
  }
  i {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: currentColor;
  }
  /* Offline: hollow dot, so the state does not depend on colour. */
  .offline i {
    background: transparent;
    border: 2px solid currentColor;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
