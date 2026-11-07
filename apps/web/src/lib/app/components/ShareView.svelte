<script lang="ts">
  import { m } from "#lib/paraglide/messages.js";
  import QrCode from "./QrCode.svelte";

  let {
    link,
    title,
    explain = m.share_explain(),
  }: { link: string; title: string; explain?: string } = $props();

  // Fixed for the page's lifetime: the browser either has a share sheet or not.
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  let copied = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => () => clearTimeout(timer));

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // The link stays on screen to select by hand.
      return;
    }
    copied = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied = false), 3000);
  }

  async function share(): Promise<void> {
    try {
      await navigator.share({ title, url: link });
    } catch {
      // Closing the sheet counts as an abort; nothing to do.
    }
  }
</script>

<h1 class="title">{title}</h1>
<p class="explain">{explain}</p>
<div class="qr"><QrCode value={link} /></div>
<p class="link selectable">{link}</p>
<div class="actions">
  <button type="button" onclick={copy}>{m.share_copy()}</button>
  {#if canShare}
    <button type="button" class="ghost" onclick={share}>{m.share_native()}</button>
  {/if}
</div>
<p class="copied" role="status">
  {#if copied}{m.share_copied()}{/if}
</p>

<style>
  .title {
    margin: 0.5rem 0 0;
    font-size: 2rem;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }
  .explain {
    margin: 0.75rem 0 1.25rem;
    font-size: 1.15rem;
  }
  .qr {
    margin-bottom: 1.25rem;
  }
  .link {
    margin: 0 0 1.25rem;
    padding: 0.75rem;
    border: 3px solid var(--field-line);
    border-radius: var(--radius);
    font-size: 1rem;
    overflow-wrap: anywhere;
    user-select: all;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
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
  button.ghost {
    background: transparent;
    color: var(--ink);
  }
  .copied {
    min-height: 1.5rem;
    margin: 0.75rem 0 0;
    font-weight: 700;
  }
</style>
