<script lang="ts">
  import type { Snippet } from "svelte";
  import { setInstall, setPending, setTomu } from "#lib/app/context.ts";
  import { InstallHint } from "#lib/app/install.svelte.ts";
  import { PendingDeletes } from "#lib/app/undo.svelte.ts";
  import { getLocale } from "#lib/paraglide/runtime.js";
  import { m } from "#lib/paraglide/messages.js";
  import type { Tomu } from "#lib/tomu/index.js";
  import Onboarding from "./Onboarding.svelte";
  import Sheet from "./Sheet.svelte";
  import UndoBar from "./UndoBar.svelte";

  let {
    tomu,
    children,
    reload = () => location.reload(),
    path = "/",
  }: { tomu: Tomu; children?: Snippet; reload?: () => void; path?: string } = $props();

  // The layout mounts this once, after the start succeeded (a retry only happens before that),
  // so the value never changes while mounted.
  // svelte-ignore state_referenced_locally
  setTomu(tomu);

  const pending = new PendingDeletes();
  setPending(pending);

  // Created here, not on the list page: the browser fires `beforeinstallprompt` once per page load,
  // usually while the overview is showing.
  const install = new InstallHint();
  setInstall(install);
  $effect(() => () => install.destroy());

  // Closing the app inside the undo window deletes nothing.
  $effect(() => {
    const discard = (): void => pending.undo();
    window.addEventListener("pagehide", discard);
    return () => {
      window.removeEventListener("pagehide", discard);
      discard();
    };
  });

  $effect(() => {
    document.documentElement.classList.toggle("large", tomu.largeView);
  });
  $effect(() => {
    document.documentElement.lang = getLocale();
  });
</script>

{#if tomu.status === "blocked"}
  <Sheet>
    <h1 class="blocked">{m.blocked_title()}</h1>
    <p>{m.blocked_hint()}</p>
    <button type="button" class="reload" onclick={reload}>{m.blocked_reload()}</button>
  </Sheet>
{:else if !tomu.onboarded && !path.startsWith("/share/")}
  <!-- A share link opens straight away; onboarding waits for the first path outside /share/. -->
  <Onboarding {tomu} />
{:else}
  {@render children?.()}
  <UndoBar />
{/if}

<style>
  .blocked {
    font-size: 2rem;
    line-height: 1.15;
    margin: 2rem 0 1rem;
  }
  p {
    font-size: 1.25rem;
  }
  .reload {
    min-width: var(--tap);
    min-height: var(--tap);
    padding: 0 1.25rem;
    border: 3px solid var(--rule);
    border-radius: var(--radius);
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 1.15rem;
    font-weight: 700;
    cursor: pointer;
  }
</style>
