<script lang="ts">
  import { getTomu } from "#lib/app/context.ts";
  import { m } from "#lib/paraglide/messages.js";

  let { selected, onChange }: { selected: string | null; onChange: (id: string | null) => void } = $props();

  const tomu = getTomu();
  const name = `folder-${Math.random().toString(36).slice(2)}`;
  const options = $derived([{ id: null as string | null, name: m.folder_none() }, ...tomu.folders]);
</script>

<fieldset>
  <legend>{m.folder_heading()}</legend>
  {#each options as option (option.id)}
    <label class="row">
      <input type="radio" {name} checked={selected === option.id} onchange={() => onChange(option.id)} />
      <span>{option.name}</span>
    </label>
  {/each}
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
</style>
