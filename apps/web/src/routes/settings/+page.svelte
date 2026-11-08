<script lang="ts">
  import { MAX_LABEL_NAME, MAX_OWNER } from "@tomu/shared";
  import { tick } from "svelte";
  import Board from "#lib/app/components/Board.svelte";
  import ConfirmDialog from "#lib/app/components/ConfirmDialog.svelte";
  import Dialog from "#lib/app/components/Dialog.svelte";
  import LabelTag from "#lib/app/components/LabelTag.svelte";
  import Sheet from "#lib/app/components/Sheet.svelte";
  import StatusBadge from "#lib/app/components/StatusBadge.svelte";
  import { getTomu } from "#lib/app/context.ts";
  import { legalLinks } from "#lib/app/legal.ts";
  import { canRename, labelText } from "#lib/app/lists.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale, setLocale } from "#lib/paraglide/runtime.js";

  const tomu = getTomu();

  // Messages are plain functions: the locale state re-renders the page after a switch.
  let locale = $state(getLocale());
  const legal = $derived(legalLinks(locale));

  // display name
  // svelte-ignore state_referenced_locally
  let name = $state(tomu.displayName);
  let nameError = $state(false);
  let nameSaved = $state(false);
  let nameFailed = $state(false);
  async function saveName(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    nameSaved = false;
    nameFailed = false;
    nameError = name.trim().length === 0;
    if (nameError) return;
    try {
      await tomu.setDisplayName(name);
    } catch {
      nameFailed = true;
      return;
    }
    name = tomu.displayName;
    nameSaved = true;
  }

  // large view; Tomu rolls the value back itself when the save fails
  let largeFailed = $state(false);
  async function toggleLargeView(): Promise<void> {
    try {
      await tomu.setLargeView(!tomu.largeView);
      largeFailed = false;
    } catch {
      largeFailed = true;
    }
  }

  // new label and folder
  let newLabel = $state("");
  let newFolder = $state("");
  async function addLabel(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (newLabel.trim().length === 0) return;
    await tomu.createLabel(newLabel);
    newLabel = "";
  }
  async function addFolder(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (newFolder.trim().length === 0) return;
    await tomu.createFolder(newFolder);
    newFolder = "";
  }

  // rename dialog, shared by labels and folders
  type Target = { kind: "label" | "folder"; id: string };
  let renaming = $state<Target | null>(null);
  let renameOpen = $state(false);
  let renameValue = $state("");
  let renameBusy = $state(false);
  function startRename(target: Target, current: string): void {
    renaming = target;
    renameValue = current;
    renameOpen = true;
  }
  async function saveRename(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (!renaming || renameValue.trim().length === 0 || renameBusy) return;
    renameBusy = true;
    try {
      if (renaming.kind === "label") await tomu.renameLabel(renaming.id, renameValue);
      else await tomu.renameFolder(renaming.id, renameValue);
      renameOpen = false;
    } finally {
      renameBusy = false;
    }
  }

  // delete confirmation
  let removing = $state<Target | null>(null);
  let removeOpen = $state(false);
  function startRemove(target: Target): void {
    removing = target;
    removeOpen = true;
  }
  async function confirmRemove(): Promise<void> {
    if (!removing) return;
    if (removing.kind === "label") await tomu.deleteLabel(removing.id);
    else await tomu.deleteFolder(removing.id);
  }

  async function chooseLocale(next: "de" | "en"): Promise<void> {
    setLocale(next, { reload: false });
    document.documentElement.lang = next;
    locale = next;
    await tick();
    document.getElementById(`lang-${next}`)?.focus();
  }
</script>

{#key locale}
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
    <h1>{m.settings_title()}</h1>

    <section>
      <h2>{m.settings_name_heading()}</h2>
      <p class="hint">{m.settings_name_hint()}</p>
      <form class="inline-form" onsubmit={saveName}>
        <input
          type="text"
          aria-label={m.settings_name_field()}
          placeholder={m.settings_name_field()}
          bind:value={name}
          maxlength={MAX_OWNER}
          autocomplete="given-name"
        />
        <button type="submit">{m.item_save()}</button>
      </form>
      {#if nameError}<p class="note" role="alert">{m.settings_name_empty()}</p>{/if}
      {#if nameFailed}<p class="note" role="alert">{m.save_failed()}</p>{/if}
      {#if nameSaved}<p class="note" role="status">{m.settings_name_saved()}</p>{/if}
    </section>

    <section>
      <h2>{m.settings_large_heading()}</h2>
      <button
        type="button"
        class="switch"
        role="switch"
        aria-checked={tomu.largeView}
        aria-label={m.settings_large_label()}
        onclick={toggleLargeView}
      >
        <span class="track" aria-hidden="true"><span class="knob"></span></span>
        <span aria-hidden="true">{m.settings_large_label()}</span>
      </button>
      {#if largeFailed}<p class="note" role="alert">{m.save_failed()}</p>{/if}
    </section>

    <section>
      <h2>{m.labels_heading()}</h2>
      {#if tomu.labels.length === 0}
        <p class="hint">{m.labels_none()}</p>
      {:else}
        <ul>
          {#each tomu.labels as label (label.id)}
            {@const text = labelText(label)}
            <li>
              <LabelTag {label} />
              <span class="actions">
                {#if canRename(label)}
                  <button
                    type="button"
                    class="ghost"
                    aria-label={m.settings_rename_item({ name: text })}
                    onclick={() => startRename({ kind: "label", id: label.id }, label.name)}
                  >
                    {m.menu_rename()}
                  </button>
                {/if}
                {#if canRename(label) && !label.shared}
                  <button
                    type="button"
                    class="ghost"
                    aria-label={m.settings_delete_item({ name: text })}
                    onclick={() => startRemove({ kind: "label", id: label.id })}
                  >
                    {m.item_delete()}
                  </button>
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
      <form class="inline-form" onsubmit={addLabel}>
        <input
          type="text"
          aria-label={m.settings_label_new_field()}
          placeholder={m.settings_label_new_field()}
          bind:value={newLabel}
          maxlength={MAX_LABEL_NAME}
        />
        <button type="submit" disabled={newLabel.trim().length === 0}>{m.settings_add()}</button>
      </form>
    </section>

    <section>
      <h2>{m.folder_heading()}</h2>
      {#if tomu.folders.length === 0}
        <p class="hint">{m.settings_folders_none()}</p>
      {:else}
        <ul>
          {#each tomu.folders as folder (folder.id)}
            <li>
              <span class="fname">{folder.name}</span>
              <span class="actions">
                <button
                  type="button"
                  class="ghost"
                  aria-label={m.settings_rename_item({ name: folder.name })}
                  onclick={() => startRename({ kind: "folder", id: folder.id }, folder.name)}
                >
                  {m.menu_rename()}
                </button>
                <button
                  type="button"
                  class="ghost"
                  aria-label={m.settings_delete_item({ name: folder.name })}
                  onclick={() => startRemove({ kind: "folder", id: folder.id })}
                >
                  {m.item_delete()}
                </button>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
      <form class="inline-form" onsubmit={addFolder}>
        <input
          type="text"
          aria-label={m.settings_folder_new_field()}
          placeholder={m.settings_folder_new_field()}
          bind:value={newFolder}
          maxlength={MAX_LABEL_NAME}
        />
        <button type="submit" disabled={newFolder.trim().length === 0}>{m.settings_add()}</button>
      </form>
    </section>

    <section>
      <h2>{m.settings_language_heading()}</h2>
      <div class="langs" role="radiogroup" aria-label={m.settings_language_heading()}>
        <label class="opt">
          <input
            id="lang-de"
            type="radio"
            name="lang"
            checked={locale === "de"}
            onchange={() => chooseLocale("de")}
          />
          <span>Deutsch</span>
        </label>
        <label class="opt">
          <input
            id="lang-en"
            type="radio"
            name="lang"
            checked={locale === "en"}
            onchange={() => chooseLocale("en")}
          />
          <span>English</span>
        </label>
      </div>
    </section>

    <section>
      <h2>{m.settings_about_heading()}</h2>
      <p>{m.settings_about_text()}</p>
      <p class="legal">
        <a href={legal.imprint}>{m.settings_imprint()}</a>
        <a href={legal.privacy}>{m.settings_privacy()}</a>
      </p>
    </section>
  </Sheet>

  <Dialog
    bind:open={renameOpen}
    title={renaming?.kind === "folder" ? m.settings_rename_folder_title() : m.settings_rename_label_title()}
  >
    <form class="dform" onsubmit={saveRename}>
      <label class="field">
        <span>{m.settings_rename_name_field()}</span>
        <input type="text" bind:value={renameValue} maxlength={MAX_LABEL_NAME} />
      </label>
      <div class="dactions">
        <button type="button" class="ghost" onclick={() => (renameOpen = false)}>{m.confirm_cancel()}</button>
        <button type="submit" disabled={renameValue.trim().length === 0 || renameBusy}>{m.item_save()}</button
        >
      </div>
    </form>
  </Dialog>

  <ConfirmDialog
    bind:open={removeOpen}
    title={removing?.kind === "folder" ? m.settings_delete_folder_title() : m.settings_delete_label_title()}
    body={removing?.kind === "folder" ? m.settings_delete_folder_body() : m.settings_delete_label_body()}
    confirmLabel={m.item_delete()}
    onConfirm={confirmRemove}
  />
{/key}

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
  section {
    padding: 1.25rem 0;
    border-top: 3px solid var(--rule);
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.35rem;
    line-height: 1.2;
  }
  .hint,
  .note {
    margin: 0 0 0.75rem;
    color: var(--ink-soft);
  }
  .note {
    margin: 0.5rem 0 0;
    color: var(--ink);
    font-weight: 700;
  }
  button {
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
    font: inherit;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }
  .ghost {
    background: transparent;
    color: var(--ink);
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
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
  .fname {
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .switch {
    gap: 0.75rem;
    padding: 0 1rem 0 0.5rem;
    background: transparent;
    color: var(--ink);
    text-align: left;
  }
  .track {
    display: inline-flex;
    align-items: center;
    flex: none;
    width: 3.25rem;
    height: 1.75rem;
    padding: 0.2rem;
    border: 3px solid var(--rule);
    border-radius: 1rem;
  }
  .knob {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: var(--rule);
  }
  /* The knob moves to the right when on: position, not colour alone, tells the state. */
  .switch[aria-checked="true"] .track {
    background: var(--rule);
    justify-content: flex-end;
  }
  .switch[aria-checked="true"] .knob {
    background: var(--sheet);
  }
  .langs {
    display: flex;
    flex-direction: column;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: var(--tap);
  }
  .opt input {
    width: 1.75rem;
    height: 1.75rem;
    margin: 0;
    accent-color: var(--ink);
  }
  .legal {
    display: flex;
    gap: 1.5rem;
  }
  .legal a {
    display: inline-flex;
    align-items: center;
    min-height: var(--tap);
    color: var(--ink);
    font-weight: 700;
  }
  .dform {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-weight: 700;
  }
  .dactions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.75rem;
  }
</style>
