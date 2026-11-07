<script lang="ts">
  import { untrack } from "svelte";
  import { dev } from "$app/env";
  import { PUBLIC_LINK_REWRITE } from "$app/env/public";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import Board from "#lib/app/components/Board.svelte";
  import Sheet from "#lib/app/components/Sheet.svelte";
  import StatusBadge from "#lib/app/components/StatusBadge.svelte";
  import { getTomu } from "#lib/app/context.ts";
  import { normalizeShareUrl } from "#lib/app/links.ts";
  import { m } from "#lib/paraglide/messages.js";

  const tomu = getTomu();

  let openedId = $state<string | null>(null);
  let notFound = $state(false);
  let started = false;
  let navigated = false;

  async function run(): Promise<void> {
    // After the key left the address bar (reload, restored tab) the document is already stored here: go on with it.
    const id = page.params.id;
    if (id && !location.hash && tomu.docStatus(id) !== "missing") {
      openedId = id;
      return;
    }
    try {
      const opened = await tomu.openLink(
        normalizeShareUrl(location.href, dev || PUBLIC_LINK_REWRITE === "1"),
      );
      if (!opened) {
        notFound = true;
        return;
      }
      // The key leaves the address bar only now that the document is stored on this device.
      history.replaceState(history.state, "", `/share/${opened.id}`);
      openedId = opened.id;
    } catch {
      notFound = true;
    }
  }

  // Another tab holds the app: nothing is opened here and the address stays as it is.
  $effect(() => {
    if (started || tomu.status === "blocked") return;
    started = true;
    untrack(() => void run());
  });

  const status = $derived(openedId ? tomu.docStatus(openedId) : "loading");

  // The document decides where to go: a list opens, a label leads to the overview.
  $effect(() => {
    if (!openedId || navigated) return;
    if (status === "list") {
      navigated = true;
      void goto(`/list/${openedId}`, { replaceState: true });
    } else if (status === "label") {
      navigated = true;
      void goto("/", { replaceState: true });
    } else if (status === "missing" || status === "gone") {
      notFound = true;
    }
  });
</script>

<Board>
  {#snippet start()}
    <a class="back" href="/">{m.back_to_lists()}</a>
  {/snippet}
  {#snippet end()}
    <StatusBadge status={tomu.status} />
  {/snippet}
</Board>

<Sheet offline={tomu.status === "offline"}>
  {#if notFound}
    <h1 class="note">{m.link_not_found()}</h1>
    <p class="hint">{m.link_not_found_hint()}</p>
    <a class="home" href="/">{m.back_to_lists()}</a>
  {:else if tomu.status === "offline"}
    <p class="note">{m.list_waiting_offline()}</p>
  {:else}
    <p class="note">{m.list_loading()}</p>
  {/if}
</Sheet>

<style>
  .back {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    color: inherit;
    font-size: 1.15rem;
    font-weight: 700;
    text-decoration: none;
  }
  .note {
    margin: 2rem 0 1rem;
    font-size: 1.5rem;
    line-height: 1.3;
    font-weight: 400;
  }
  .home {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    margin-top: 1.25rem;
    padding: 0 1.25rem;
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    color: var(--ink);
    font-size: 1.15rem;
    font-weight: 700;
    text-decoration: none;
  }
  .hint {
    margin: 0;
    font-size: 1.15rem;
  }
</style>
