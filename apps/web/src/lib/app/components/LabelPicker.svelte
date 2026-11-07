<script lang="ts">
  import { getTomu } from "#lib/app/context.ts";
  import { m } from "#lib/paraglide/messages.js";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import LabelTag from "./LabelTag.svelte";

  let {
    selected,
    existingList,
    onChange,
  }: { selected: string[]; existingList: boolean; onChange: (ids: string[]) => void } = $props();

  const tomu = getTomu();
  // Adding a shared label to an existing list gives everyone on that label access to it, and that cannot be
  // taken back. So it is only saved after the user agreed; until then the saved state stays as it is.
  let askId = $state<string | null>(null);
  let askOpen = $state(false);

  const apply = (id: string, on: boolean): void =>
    onChange(on ? [...selected.filter((s) => s !== id), id] : selected.filter((s) => s !== id));

  function toggle(input: HTMLInputElement, id: string): void {
    const on = input.checked;
    if (on && existingList && tomu.labels.some((l) => l.id === id && l.shared)) {
      input.checked = false; // shown as ticked only once confirmed
      askId = id;
      askOpen = true;
      return;
    }
    apply(id, on);
  }
</script>

<fieldset>
  <legend>{m.labels_heading()}</legend>
  {#each tomu.labels as label (label.id)}
    <label class="row">
      <input
        type="checkbox"
        checked={selected.includes(label.id)}
        onchange={(e) => toggle(e.currentTarget, label.id)}
      />
      <LabelTag {label} />
    </label>
  {:else}
    <p class="none">{m.labels_none()}</p>
  {/each}
</fieldset>

<ConfirmDialog
  bind:open={askOpen}
  title={m.label_share_confirm_title()}
  body={m.label_share_warning()}
  confirmLabel={m.menu_share()}
  onConfirm={() => {
    if (askId) apply(askId, true);
    askId = null;
  }}
/>

<style>
  fieldset {
    margin: 0 0 1rem;
    padding: 0;
    border: 0;
  }
  legend {
    padding: 0;
    font-weight: 700;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: var(--tap);
  }
  input {
    width: 1.75rem;
    height: 1.75rem;
    margin: 0;
    accent-color: var(--ink);
  }
  .none {
    margin: 0.25rem 0 0;
    color: var(--ink-soft);
  }
</style>
