<script lang="ts">
  import "./app.css";
  import type { Snippet } from "svelte";
  import { PUBLIC_API_URL } from "$app/env/public";
  import Shell from "#lib/app/components/Shell.svelte";
  import Sheet from "#lib/app/components/Sheet.svelte";
  import { m } from "#lib/paraglide/messages.js";
  import { startTomu, type Tomu } from "#lib/tomu/index.js";

  let { children }: { children: Snippet } = $props();

  let tomu = $state.raw<Tomu | null>(null);
  let failed = $state(false);
  let attempt = $state(0);

  $effect(() => {
    void attempt;
    let current: Tomu | null = null;
    let cancelled = false;
    failed = false;
    startTomu({ apiUrl: PUBLIC_API_URL }).then(
      (t) => {
        if (cancelled) void t.stop();
        else tomu = current = t;
      },
      () => {
        if (!cancelled) failed = true;
      },
    );
    return () => {
      cancelled = true;
      void current?.stop();
    };
  });
</script>

{#if tomu}
  <Shell {tomu} {children} />
{:else if failed}
  <Sheet>
    <p class="failed">{m.start_failed()}</p>
    <button type="button" class="retry" onclick={() => attempt++}>{m.start_retry()}</button>
  </Sheet>
{:else}
  <!-- Empty sheet while the local database opens: no spinner. -->
  <Sheet />
{/if}

<style>
  .failed {
    margin: 2rem 0 1.25rem;
    font-size: 1.5rem;
    line-height: 1.3;
  }
  .retry {
    width: 100%;
    min-height: 3.75rem;
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    background: var(--rule);
    color: var(--sheet);
    font: inherit;
    font-size: 1.15rem;
    font-weight: 700;
    cursor: pointer;
  }
</style>
