<script lang="ts">
  import Board from "#lib/app/components/Board.svelte";
  import Shell from "#lib/app/components/Shell.svelte";
  import type { Tomu } from "#lib/tomu/index.js";

  let { tomu, reload }: { tomu: Tomu; reload?: () => void } = $props();
</script>

<Shell {tomu} {reload}>
  <Board />
  <p>app content</p>
</Shell>
