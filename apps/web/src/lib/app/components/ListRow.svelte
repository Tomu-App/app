<script lang="ts">
  import type { Attachment } from "svelte/attachments";
  import { getTomu } from "#lib/app/context.ts";
  import { openCount } from "#lib/app/lists.ts";
  import { m } from "#lib/paraglide/messages.js";
  import type { ListInfo } from "#lib/tomu/index.js";
  import LabelTag from "./LabelTag.svelte";

  let {
    list,
    handle,
  }: {
    list: ListInfo;
    /** Marks the grip that drags the row; only it starts a drag, so a tap or a swipe on the row never does. */
    handle: Attachment<HTMLElement>;
  } = $props();

  const tomu = getTomu();
  const view = $derived(tomu.list(list.id));
  const count = $derived(openCount(view));
  const labels = $derived(tomu.labels.filter((l) => list.labelIds.includes(l.id)));
</script>

{#snippet body()}
  <span class="text">
    <span class="title">{list.title}</span>
    {#if labels.length > 0}
      <span class="labels"
        >{#each labels as label (label.id)}<LabelTag {label} />{/each}</span
      >
    {/if}
  </span>
  {#if view}
    <span class="count" class:zero={count === 0} role="img" aria-label={m.list_open_count({ count })}
      >{count}</span
    >
  {:else}
    <span class="loading">{m.list_loading()}</span>
  {/if}
{/snippet}

<div class="row">
  {#if view}
    <a class="main" href={`/list/${list.id}`}>{@render body()}</a>
  {:else}
    <div class="main">{@render body()}</div>
  {/if}
  <!-- Not a <button>: the library ignores its drag keys on native buttons. It keeps role and tab stop up to date. -->
  <div
    class="grip"
    role="button"
    tabindex="0"
    aria-label={m.list_move({ title: list.title })}
    {@attach handle}
  >
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <circle cx="9" cy="6" r="1.75" />
      <circle cx="15" cy="6" r="1.75" />
      <circle cx="9" cy="12" r="1.75" />
      <circle cx="15" cy="12" r="1.75" />
      <circle cx="9" cy="18" r="1.75" />
      <circle cx="15" cy="18" r="1.75" />
    </svg>
  </div>
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-bottom: 2px solid var(--perf);
  }
  .main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
    min-height: 4.5rem;
    padding: 0.5rem 0;
    color: inherit;
    text-decoration: none;
  }
  .grip {
    flex: none;
    display: grid;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    border-radius: var(--radius);
    color: var(--ink-soft);
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
