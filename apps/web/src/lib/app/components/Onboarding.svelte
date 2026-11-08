<script lang="ts">
  import { MAX_OWNER } from "@tomu/shared";
  import { tick } from "svelte";
  import Sheet from "#lib/app/components/Sheet.svelte";
  import { getInstall } from "#lib/app/context.ts";
  import { legalLinks } from "#lib/app/legal.ts";
  import { m } from "#lib/paraglide/messages.js";
  import { getLocale, setLocale } from "#lib/paraglide/runtime.js";
  import type { Tomu } from "#lib/tomu/index.js";

  let { tomu }: { tomu: Tomu } = $props();
  const install = getInstall();

  let step = $state(1);
  // Messages are plain functions: the locale state re-renders the steps after a switch.
  let locale = $state(getLocale());
  // svelte-ignore state_referenced_locally
  let name = $state(tomu.displayName);
  let nameError = $state(false);
  // A save is running: Next and Done ignore further clicks until it ends.
  let busy = $state(false);
  let saveFailed = $state(false);
  let heading = $state<HTMLElement>();

  // The browser can report install support late, so the count follows `install.visible`. Once the install
  // step is open it stays: after one prompt the event is used up and `visible` turns false.
  const total = $derived(install.visible || step === 4 ? 4 : 3);
  const legal = $derived(legalLinks(locale));

  async function go(next: number): Promise<void> {
    saveFailed = false;
    step = next;
    await tick();
    heading?.focus();
  }

  async function chooseLocale(next: "de" | "en"): Promise<void> {
    setLocale(next, { reload: false });
    document.documentElement.lang = next;
    locale = next;
    await tick();
    document.getElementById(`onboarding-lang-${next}`)?.focus();
  }

  /** Runs a save once at a time; a failure keeps the step and shows a note instead of leaving the person stuck. */
  async function save(run: () => Promise<void>): Promise<boolean> {
    if (busy) return false;
    busy = true;
    saveFailed = false;
    try {
      await run();
      return true;
    } catch {
      saveFailed = true;
      return false;
    } finally {
      busy = false;
    }
  }

  /** No busy guard: quick taps must keep working. Tomu rolls the value back itself when the save fails. */
  async function toggleLargeView(): Promise<void> {
    try {
      await tomu.setLargeView(!tomu.largeView);
      saveFailed = false;
    } catch {
      saveFailed = true;
    }
  }

  async function saveName(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    nameError = name.trim().length === 0;
    if (nameError) return;
    if (!(await save(() => tomu.setDisplayName(name)))) return;
    name = tomu.displayName;
    await go(3);
  }

  async function finish(): Promise<void> {
    await save(async () => {
      await tomu.completeOnboarding();
      // The person saw the install offer here, so the small hint above the lists does not ask again.
      if (step === 4) install.dismiss();
    });
  }
</script>

{#snippet nav(submit: boolean)}
  <div class="nav">
    {#if saveFailed}<p class="note" role="alert">{m.save_failed()}</p>{/if}
    {#if step === total}
      <p class="privacy">
        {m.onboarding_privacy()}
        <a href={legal.privacy} target="_blank" rel="noopener">{m.settings_privacy()}</a>
      </p>
    {/if}
    <!-- Back on the left, forward on the right, as the reading direction goes. -->
    <div class="buttons">
      {#if step > 1}
        <button type="button" class="ghost" onclick={() => go(step - 1)}>{m.onboarding_back()}</button>
      {/if}
      {#if step === total}
        <button type="button" class="primary" onclick={finish}>{m.onboarding_done()}</button>
      {:else if submit}
        <button type="submit" class="primary">{m.onboarding_next()}</button>
      {:else}
        <button type="button" class="primary" onclick={() => go(step + 1)}>{m.onboarding_next()}</button>
      {/if}
    </div>
  </div>
{/snippet}

{#key locale}
  <Sheet offline={tomu.status === "offline"}>
    <h1>{m.onboarding_welcome()}</h1>
    <p class="progress" id="onboarding-progress">{m.onboarding_step({ current: step, total })}</p>

    {#if step === 1}
      <section>
        <h2 bind:this={heading} tabindex="-1" aria-describedby="onboarding-progress">
          {m.settings_language_heading()}
        </h2>
        <fieldset class="langs">
          <legend class="visually-hidden">{m.settings_language_heading()}</legend>
          <label class="opt">
            <input
              id="onboarding-lang-de"
              type="radio"
              name="onboarding-lang"
              checked={locale === "de"}
              onchange={() => chooseLocale("de")}
            />
            <span>Deutsch</span>
          </label>
          <label class="opt">
            <input
              id="onboarding-lang-en"
              type="radio"
              name="onboarding-lang"
              checked={locale === "en"}
              onchange={() => chooseLocale("en")}
            />
            <span>English</span>
          </label>
        </fieldset>
      </section>
      {@render nav(false)}
    {:else if step === 2}
      <form onsubmit={saveName}>
        <section>
          <h2 bind:this={heading} tabindex="-1" aria-describedby="onboarding-progress">
            {m.settings_name_heading()}
          </h2>
          <p class="hint">{m.settings_name_hint()}</p>
          <input
            type="text"
            aria-label={m.settings_name_field()}
            placeholder={m.settings_name_field()}
            bind:value={name}
            maxlength={MAX_OWNER}
            autocomplete="given-name"
          />
          {#if nameError}<p class="note" role="alert">{m.settings_name_empty()}</p>{/if}
        </section>
        {@render nav(true)}
      </form>
    {:else if step === 3}
      <section>
        <h2 bind:this={heading} tabindex="-1" aria-describedby="onboarding-progress">
          {m.settings_large_heading()}
        </h2>
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
      </section>
      {@render nav(false)}
    {:else}
      <section>
        <h2 bind:this={heading} tabindex="-1" aria-describedby="onboarding-progress">
          {m.onboarding_install_heading()}
        </h2>
        {#if install.kind === "ios"}
          <p>{m.install_ios()}</p>
        {:else}
          <p>{m.install_text()}</p>
          {#if install.kind === "prompt"}
            <button type="button" class="install" onclick={() => install.install()}
              >{m.install_button()}</button
            >
          {/if}
        {/if}
      </section>
      {@render nav(false)}
    {/if}

    <p class="later">{m.onboarding_later()}</p>
  </Sheet>
{/key}

<style>
  h1 {
    margin: 0.5rem 0 0.25rem;
    font-size: 2rem;
    line-height: 1.1;
  }
  .progress {
    margin: 0 0 1rem;
    color: var(--ink-soft);
    font-weight: 700;
  }
  section {
    padding: 1.25rem 0;
    border-top: 3px solid var(--rule);
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.35rem;
    line-height: 1.2;
  }
  h2:focus {
    outline: none;
  }
  p {
    margin: 0 0 0.75rem;
  }
  .hint,
  .later {
    color: var(--ink-soft);
  }
  .note {
    margin: 0.5rem 0 0;
    font-weight: 700;
  }
  /* The field itself is styled globally in app.css. */
  input[type="text"] {
    box-sizing: border-box;
    width: 100%;
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
    cursor: pointer;
  }
  .ghost {
    background: transparent;
    color: var(--ink);
  }
  .nav {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.5rem 0 1.25rem;
  }
  .buttons {
    display: flex;
    gap: 0.75rem;
  }
  .buttons button {
    flex: 1 1 0;
    min-height: 3.75rem;
    font-size: 1.15rem;
  }
  .privacy a {
    color: var(--ink);
    font-weight: 700;
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
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  /* The heading above already shows the group name; the legend is for screen readers only. */
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
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
</style>
