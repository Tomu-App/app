<script lang="ts">
  import { InstallHint } from "#lib/app/install.svelte.ts";
  import { m } from "#lib/paraglide/messages.js";

  const hint = new InstallHint();
  $effect(() => () => hint.destroy());
</script>

{#if hint.visible}
  <aside class="hint">
    <p class="text">{hint.kind === "ios" ? m.install_ios() : m.install_text()}</p>
    <div class="actions">
      {#if hint.kind === "prompt"}
        <button type="button" class="install" onclick={() => void hint.install()}>{m.install_button()}</button>
      {/if}
      <button type="button" class="close" aria-label={m.install_close()} onclick={() => hint.dismiss()}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  </aside>
{/if}

<style>
  .hint {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.75rem;
    padding-left: 0.75rem;
    border-left: 4px solid var(--rule);
    color: var(--ink-soft);
  }
  .text {
    flex: 1;
    margin: 0;
    font-size: 1rem;
    line-height: 1.3;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  button {
    min-width: var(--tap);
    min-height: var(--tap);
    border: 0;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .install {
    padding: 0 0.75rem;
    border: 3px solid var(--rule);
    border-radius: var(--radius);
  }
  .close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
</style>
