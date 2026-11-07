<script lang="ts">
  import type { Snippet } from "svelte";

  let { offline = false, children }: { offline?: boolean; children?: Snippet } = $props();
</script>

<main class="sheet" class:offline>
  {@render children?.()}
</main>

<style>
  .sheet {
    flex: 1;
    width: 100%;
    max-width: 40rem;
    margin-inline: auto;
    padding: 1.25rem 1.25rem 2.5rem;
    background: var(--sheet);
    color: var(--ink);
    border: 3px solid transparent;
    border-radius: 6px 6px 0 0;
    border-bottom: 0;
  }
  /* Offline is shown by shape (dashed edge), not by colour alone. */
  .sheet.offline {
    border-color: var(--perf);
    border-style: dashed;
    border-bottom: 0;
  }
</style>
