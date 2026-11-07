<script lang="ts">
  import Board from "#lib/app/components/Board.svelte";
  import ListRow from "#lib/app/components/ListRow.svelte";
  import Logo from "#lib/app/components/Logo.svelte";
  import NewListDialog from "#lib/app/components/NewListDialog.svelte";
  import Sheet from "#lib/app/components/Sheet.svelte";
  import StatusBadge from "#lib/app/components/StatusBadge.svelte";
  import { getTomu } from "#lib/app/context.ts";
  import { groupLists } from "#lib/app/lists.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale } from "#lib/paraglide/runtime.js";

  const tomu = getTomu();
  let creating = $state(false);
  const groups = $derived(groupLists(tomu.lists, tomu.folders, getLocale()));
</script>

<Board>
  {#snippet start()}<Logo />{/snippet}
  {#snippet end()}
    <StatusBadge status={tomu.status} />
    <a class="icon" href="/labels" aria-label={m.labels_share_button()}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="m8.59 13.51 6.83 3.98" />
        <path d="m15.41 6.51-6.82 3.98" />
      </svg>
    </a>
    <a class="icon" href="/settings" aria-label={m.settings_button()}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M11 10.27 7 3.34" />
        <path d="m11 13.73-4 6.93" />
        <path d="M12 22v-2" />
        <path d="M12 2v2" />
        <path d="M14 12h8" />
        <path d="m17 20.66-1-1.73" />
        <path d="m17 3.34-1 1.73" />
        <path d="M2 12h2" />
        <path d="m20.66 17-1.73-1" />
        <path d="m20.66 7-1.73 1" />
        <path d="m3.34 17 1.73-1" />
        <path d="m3.34 7 1.73 1" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="12" r="8" />
      </svg>
    </a>
  {/snippet}
</Board>

<Sheet offline={tomu.status === "offline"}>
  <h1 class="sr">{m.overview_title()}</h1>
  {#if groups.length === 0}
    <p class="empty">{m.overview_empty()}</p>
  {:else}
    {#each groups as group (group.folder?.id ?? "")}
      <section>
        {#if group.folder}<h2>{group.folder.name}</h2>{/if}
        {#each group.lists as list (list.id)}<ListRow {list} />{/each}
      </section>
    {/each}
  {/if}
  <button type="button" class="new" onclick={() => (creating = true)}>{m.new_list()}</button>
</Sheet>

<NewListDialog bind:open={creating} />

<style>
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: var(--tap);
    height: var(--tap);
    border: 3px solid currentColor;
    border-radius: var(--radius);
    color: inherit;
  }
  .empty {
    margin: 2rem 0;
    font-size: 1.5rem;
    line-height: 1.3;
  }
  h2 {
    margin: 1.5rem 0 0;
    font-size: 1.125rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--board-text);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .new {
    display: block;
    width: 100%;
    min-height: 4rem;
    margin-top: 2rem;
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    background: var(--rule);
    color: var(--sheet);
    font: inherit;
    font-size: 1.25rem;
    font-weight: 700;
    cursor: pointer;
  }
</style>
