<script lang="ts">
  import { untrack } from "svelte";
  import { getTomu } from "#lib/app/context.ts";
  import { m } from "#lib/paraglide/messages.js";
  import LabelTag from "./LabelTag.svelte";

  let {
    selected,
    existingList,
    onChange,
  }: { selected: string[]; existingList: boolean; onChange: (ids: string[]) => void } = $props();

  const tomu = getTomu();
  const initial = untrack(() => new Set(selected));
  const warn = $derived(
    existingList && tomu.labels.some((l) => l.shared && selected.includes(l.id) && !initial.has(l.id)),
  );

  const toggle = (id: string, on: boolean): void =>
    onChange(on ? [...selected.filter((s) => s !== id), id] : selected.filter((s) => s !== id));
</script>

<fieldset>
  <legend>{m.labels_heading()}</legend>
  {#each tomu.labels as label (label.id)}
    <label class="row">
      <input
        type="checkbox"
        checked={selected.includes(label.id)}
        onchange={(e) => toggle(label.id, e.currentTarget.checked)}
      />
      <LabelTag {label} />
    </label>
  {:else}
    <p class="none">{m.labels_none()}</p>
  {/each}
  {#if warn}<p class="warn" role="status">{m.label_share_warning()}</p>{/if}
</fieldset>

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
  .none,
  .warn {
    margin: 0.25rem 0 0;
    color: var(--ink-soft);
  }
  .warn {
    color: var(--ink);
  }
</style>
