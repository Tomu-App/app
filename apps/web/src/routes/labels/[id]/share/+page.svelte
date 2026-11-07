<script lang="ts">
  import { untrack } from "svelte";
  import { page } from "$app/state";
  import Board from "#lib/app/components/Board.svelte";
  import Sheet from "#lib/app/components/Sheet.svelte";
  import ShareView from "#lib/app/components/ShareView.svelte";
  import StatusBadge from "#lib/app/components/StatusBadge.svelte";
  import { getTomu } from "#lib/app/context.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { DisplayNameRequiredError } from "#lib/tomu/index.js";

  const tomu = getTomu();
  const id = $derived(page.params.id ?? "");
  const label = $derived(tomu.labels.find((l) => l.id === id));

  let link = $state<string | null>(null);
  let needName = $state(false);
  let failed = $state(false);
  let name = $state("");
  let busy = $state(false);

  // Sharing turns a private label into a shared one; it runs once per label, not on every change of the label list.
  async function load(labelId: string): Promise<void> {
    link = null;
    needName = false;
    failed = false;
    try {
      const url = await tomu.shareLabel(labelId);
      if (id === labelId) link = url;
    } catch (err) {
      if (id !== labelId) return;
      if (err instanceof DisplayNameRequiredError) needName = true;
      else failed = true;
    }
  }
  $effect(() => {
    const labelId = id;
    untrack(() => void load(labelId));
  });

  async function saveName(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (name.trim().length === 0 || busy) return;
    busy = true;
    try {
      await tomu.setDisplayName(name);
      await load(id);
    } finally {
      busy = false;
    }
  }
</script>

<Board>
  {#snippet start()}
    <a class="back" href="/">
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
  {#if link && label}
    <ShareView {link} title={label.name} explain={m.share_explain_label()} />
  {:else if needName}
    <h1 class="title">{m.share_label_title()}</h1>
    <form onsubmit={saveName}>
      <label class="field">
        <span>{m.share_name_prompt()}</span>
        <input type="text" aria-label={m.share_name_field()} bind:value={name} maxlength="60" autocomplete="given-name" />
      </label>
      <button type="submit" disabled={name.trim().length === 0 || busy}>{m.share_name_save()}</button>
    </form>
  {:else if failed || !label}
    <p class="note">{m.list_missing()}</p>
  {:else}
    <p class="note">{m.list_loading()}</p>
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
  .title {
    margin: 0.5rem 0 1rem;
    font-size: 2rem;
    line-height: 1.1;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
    font-size: 1.15rem;
    font-weight: 700;
  }
  input {
    min-height: 3.5rem;
    padding: 0 0.75rem;
    border: 3px solid var(--field-line);
    border-radius: var(--radius);
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-weight: 400;
  }
  button {
    min-width: var(--tap);
    min-height: var(--tap);
    padding: 0 1.25rem;
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    background: var(--rule);
    color: var(--sheet);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .note {
    margin: 2rem 0;
    font-size: 1.5rem;
    line-height: 1.3;
  }
</style>
