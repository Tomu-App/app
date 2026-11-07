<script lang="ts">
  import InstallHint from "#lib/app/components/InstallHint.svelte";
  import Shell from "#lib/app/components/Shell.svelte";
  import type { Tomu } from "#lib/tomu/index.js";

  let { tomu }: { tomu: Tomu } = $props();
  let onList = $state(false);
</script>

<Shell {tomu}>
  <button type="button" onclick={() => (onList = !onList)}>toggle</button>
  {#if onList}<InstallHint />{/if}
</Shell>
