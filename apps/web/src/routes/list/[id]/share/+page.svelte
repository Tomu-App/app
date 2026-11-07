<script lang="ts">
  import { page } from "$app/state";
  import Board from "#lib/app/components/Board.svelte";
  import Sheet from "#lib/app/components/Sheet.svelte";
  import ShareView from "#lib/app/components/ShareView.svelte";
  import StatusBadge from "#lib/app/components/StatusBadge.svelte";
  import { getTomu } from "#lib/app/context.ts";
  import { m } from "#lib/paraglide/messages.js";

  const tomu = getTomu();
  const id = $derived(page.params.id ?? "");
  const status = $derived(tomu.docStatus(id));
  const view = $derived(tomu.list(id));
  const link = $derived(status === "list" && view ? tomu.shareList(id) : null);
</script>

<Board>
  {#snippet start()}
    <a class="back" href={status === "list" ? `/list/${id}` : "/"}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square">
        <path d="M15 4l-8 8 8 8" />
      </svg>
      {m.menu_back()}
    </a>
  {/snippet}
  {#snippet end()}
    <StatusBadge status={tomu.status} />
  {/snippet}
</Board>

<Sheet offline={tomu.status === "offline"}>
  {#if link && view}
    <ShareView {link} title={view.title} />
  {:else if status === "loading"}
    <p class="note">{m.list_loading()}</p>
  {:else}
    <p class="note">{status === "gone" ? m.list_gone() : m.list_missing()}</p>
  {/if}
</Sheet>

<style>
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-height: var(--tap);
    padding-right: 0.5rem;
    color: inherit;
    font-size: 1.15rem;
    font-weight: 700;
    text-decoration: none;
  }
  .note {
    margin: 2rem 0;
    font-size: 1.5rem;
    line-height: 1.3;
  }
</style>
