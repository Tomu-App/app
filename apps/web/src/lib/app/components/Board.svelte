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
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.25rem 1rem;
    min-height: 6.1rem;
    /* Content lines up with the sheet below (40rem, 1.25rem padding, 3px edge). */
    padding: 1rem max(1rem, calc((100% - 40rem) / 2 + 1.25rem + 3px)) 0;
    background: var(--board);
    color: var(--board-ink);
  }
  .start,
  .end {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    min-width: 0;
    gap: 0.25rem 0.75rem;
    min-height: var(--tap);
  }
  .end {
    justify-content: flex-end;
  }
</style>
