<script lang="ts">
  import Board from "#lib/app/components/Board.svelte";
  import Shell from "#lib/app/components/Shell.svelte";
  import type { Tomu } from "#lib/tomu/index.js";

  let { tomu, reload, path }: { tomu: Tomu; reload?: () => void; path?: string } = $props();
</script>

<Shell {tomu} {reload} {path}>
  <Board />
  <p>app content</p>
</Shell>
