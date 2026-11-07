<script lang="ts">
  import "./app.css";
  import type { Snippet } from "svelte";
  import { PUBLIC_API_URL } from "$app/env/public";
  import Shell from "#lib/app/components/Shell.svelte";
  import Sheet from "#lib/app/components/Sheet.svelte";
  import { startTomu, type Tomu } from "#lib/tomu/index.js";

  let { children }: { children: Snippet } = $props();

  let tomu = $state.raw<Tomu | null>(null);

  $effect(() => {
    let current: Tomu | null = null;
    let cancelled = false;
    void startTomu({ apiUrl: PUBLIC_API_URL }).then((t) => {
      if (cancelled) void t.stop();
      else tomu = current = t;
    });
    return () => {
      cancelled = true;
      void current?.stop();
    };
  });
</script>

{#if tomu}
  <Shell {tomu} {children} />
{:else}
  <!-- Empty sheet while the local database opens: no spinner. -->
  <Sheet />
{/if}
