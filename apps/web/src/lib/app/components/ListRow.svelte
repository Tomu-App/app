<script lang="ts">
  import { getTomu } from "#lib/app/context.ts";
  import { openCount } from "#lib/app/lists.ts";
  import { m } from "#lib/paraglide/messages.js";
  import type { ListInfo } from "#lib/tomu/index.js";
  import LabelTag from "./LabelTag.svelte";

  let { list }: { list: ListInfo } = $props();

  const tomu = getTomu();
  const view = $derived(tomu.list(list.id));
  const count = $derived(openCount(view));
  const labels = $derived(tomu.labels.filter((l) => list.labelIds.includes(l.id)));
</script>

{#snippet body()}
  <span class="text">
    <span class="title">{list.title}</span>
    {#if labels.length > 0}
      <span class="labels">{#each labels as label (label.id)}<LabelTag {label} />{/each}</span>
    {/if}
  </span>
  {#if view}
    <span class="count" class:zero={count === 0} role="img" aria-label={m.list_open_count({ count })}>{count}</span>
  {:else}
    <span class="loading">{m.list_loading()}</span>
  {/if}
{/snippet}

{#if view}
  <a class="row" href={`/list/${list.id}`}>{@render body()}</a>
{:else}
  <div class="row">{@render body()}</div>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 4.5rem;
    padding: 0.5rem 0;
    border-bottom: 2px solid var(--perf);
    color: inherit;
    text-decoration: none;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }
  .title {
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.15;
    overflow-wrap: anywhere;
  }
  .labels {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .count {
    font-family: var(--font-count);
    font-stretch: 70%;
    font-weight: 900;
    font-size: 3rem;
    line-height: 1;
    color: var(--open);
  }
  .count.zero {
    color: var(--ink-soft);
  }
  .loading {
    color: var(--ink-soft);
  }
</style>
