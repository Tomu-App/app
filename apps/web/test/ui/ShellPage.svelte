<script lang="ts">
  import Shell from "#lib/app/components/Shell.svelte";
  import type { Tomu } from "#lib/tomu/index.js";
  import Page from "../../src/routes/list/[id]/+page.svelte";

  let { tomu }: { tomu: Tomu } = $props();
</script>

<Shell {tomu}><Page /></Shell>
