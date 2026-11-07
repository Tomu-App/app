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
    <a class="settings" href="/settings">{m.settings_button()}</a>
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
  .settings {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    padding: 0 1rem;
    border: 3px solid currentColor;
    border-radius: var(--radius);
    color: inherit;
    font-weight: 700;
    text-decoration: none;
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
