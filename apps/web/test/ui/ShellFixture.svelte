<script lang="ts">
  import Board from "#lib/app/components/Board.svelte";
  import Shell from "#lib/app/components/Shell.svelte";
  import type { Tomu } from "#lib/tomu/index.js";

  let { tomu }: { tomu: Tomu } = $props();
</script>

<Shell {tomu}>
  <Board />
  <p>app content</p>
</Shell>
