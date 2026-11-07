<script lang="ts">
  import Board from "#lib/app/components/Board.svelte";
  import LabelTag from "#lib/app/components/LabelTag.svelte";
  import Sheet from "#lib/app/components/Sheet.svelte";
  import StatusBadge from "#lib/app/components/StatusBadge.svelte";
  import { getTomu } from "#lib/app/context.ts";
  import { labelText } from "#lib/app/lists.ts";
  import { m } from "#lib/paraglide/messages.js";

  const tomu = getTomu();
</script>

<Board>
  {#snippet start()}
    <a class="back" href="/">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        stroke-width="3"
        stroke-linecap="square"
      >
        <path d="M15 4l-8 8 8 8" />
      </svg>
      {m.back_to_lists()}
    </a>
  {/snippet}
  {#snippet end()}
    <StatusBadge status={tomu.status} />
  {/snippet}
</Board>

<Sheet offline={tomu.status === "offline"}>
  <h1>{m.labels_share_button()}</h1>
  {#if tomu.labels.length === 0}
    <p class="hint">{m.labels_none()}</p>
    <p class="hint">{m.labels_none_hint()}</p>
    <a class="btn" href="/settings">{m.settings_button()}</a>
  {:else}
    <p class="hint">{m.labels_share_explain()}</p>
    <ul>
      {#each tomu.labels as label (label.id)}
        <li>
          <LabelTag {label} />
          <a
            class="btn ghost"
            href="/labels/{label.id}/share"
            aria-label={m.settings_share_item({ name: labelText(label) })}>{m.menu_share()}</a
          >
        </li>
      {/each}
    </ul>
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
  h1 {
    margin: 0.5rem 0 1rem;
    font-size: 2rem;
    line-height: 1.1;
  }
  .hint {
    margin: 0 0 0.75rem;
    color: var(--ink-soft);
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--tap);
    min-height: var(--tap);
    padding: 0 1.25rem;
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    background: var(--rule);
    color: var(--sheet);
    font-weight: 700;
    text-decoration: none;
  }
  .ghost {
    background: transparent;
    color: var(--ink);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.5rem 0;
    border-bottom: 1px dashed var(--perf);
  }
</style>
