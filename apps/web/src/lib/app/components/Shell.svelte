<script lang="ts">
  import type { Snippet } from "svelte";
  import { setTomu } from "#lib/app/context.ts";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { m } from "#lib/paraglide/messages.js";
  import type { Tomu } from "#lib/tomu/index.js";
  import Sheet from "./Sheet.svelte";

  let { tomu, children }: { tomu: Tomu; children?: Snippet } = $props();

  // The layout keys this component on the instance, so the value never changes while mounted.
  // svelte-ignore state_referenced_locally
  setTomu(tomu);

  $effect(() => {
    document.documentElement.classList.toggle("large", tomu.largeView);
  });
  $effect(() => {
    document.documentElement.lang = getLocale();
  });
</script>

{#if tomu.status === "blocked"}
  <Sheet>
    <h1 class="blocked">{m.blocked_title()}</h1>
    <p>{m.blocked_hint()}</p>
  </Sheet>
{:else}
  {@render children?.()}
{/if}

<style>
  .blocked {
    font-size: 2rem;
    line-height: 1.15;
    margin: 2rem 0 1rem;
  }
  p {
    font-size: 1.25rem;
  }
</style>
