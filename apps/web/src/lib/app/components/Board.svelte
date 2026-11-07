<script lang="ts">
  import type { Snippet } from "svelte";

  let { start, end }: { start?: Snippet; end?: Snippet } = $props();
</script>

<header class="board" data-board>
  <div class="start">{@render start?.()}</div>
  <div class="end">{@render end?.()}</div>
</header>

<style>
  .board {
    --focus: var(--board-focus);
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    min-height: 6.1rem;
    padding: 1rem 1rem 0;
    background: var(--board);
    color: var(--board-ink);
  }
  .start,
  .end {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: var(--tap);
  }
  .end {
    justify-content: flex-end;
  }
</style>
