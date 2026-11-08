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
  let heading = $state<HTMLElement>();

  // The browser can report install support late, so the count follows `install.visible`. Once the install
  // step is open it stays: after one prompt the event is used up and `visible` turns false.
  const total = $derived(install.visible || step === 4 ? 4 : 3);
  const legal = $derived(legalLinks(locale));

  async function go(next: number): Promise<void> {
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

  async function saveName(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    nameError = name.trim().length === 0;
    if (nameError) return;
    await tomu.setDisplayName(name);
    name = tomu.displayName;
    await go(3);
  }

  async function finish(): Promise<void> {
    // The person saw the install offer here, so the small hint above the lists does not ask again.
    if (step === 4) install.dismiss();
    await tomu.completeOnboarding();
  }
</script>

{#snippet nav(submit: boolean)}
  <div class="nav">
    {#if step === total}
      <p class="privacy">
        {m.onboarding_privacy()}
        <a href={legal.privacy}>{m.settings_privacy()}</a>
      </p>
      <button type="button" class="primary" onclick={finish}>{m.onboarding_done()}</button>
    {:else if submit}
      <button type="submit" class="primary">{m.onboarding_next()}</button>
    {:else}
      <button type="button" class="primary" onclick={() => go(step + 1)}>{m.onboarding_next()}</button>
    {/if}
    {#if step > 1}
      <button type="button" class="ghost" onclick={() => go(step - 1)}>{m.onboarding_back()}</button>
    {/if}
  </div>
{/snippet}

{#key locale}
  <Sheet offline={tomu.status === "offline"}>
    <h1>{m.onboarding_welcome()}</h1>
    <p class="progress" aria-live="polite">{m.onboarding_step({ current: step, total })}</p>

    {#if step === 1}
      <section>
        <h2 bind:this={heading} tabindex="-1">{m.settings_language_heading()}</h2>
        <div class="langs" role="radiogroup" aria-label={m.settings_language_heading()}>
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
        </div>
      </section>
      {@render nav(false)}
    {:else if step === 2}
      <form onsubmit={saveName}>
        <section>
          <h2 bind:this={heading} tabindex="-1">{m.settings_name_heading()}</h2>
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
        <h2 bind:this={heading} tabindex="-1">{m.settings_large_heading()}</h2>
        <button
          type="button"
          class="switch"
          role="switch"
          aria-checked={tomu.largeView}
          aria-label={m.settings_large_label()}
          onclick={() => tomu.setLargeView(!tomu.largeView)}
        >
          <span class="track" aria-hidden="true"><span class="knob"></span></span>
          <span aria-hidden="true">{m.settings_large_label()}</span>
        </button>
      </section>
      {@render nav(false)}
    {:else}
      <section>
        <h2 bind:this={heading} tabindex="-1">{m.onboarding_install_heading()}</h2>
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
  .primary {
    width: 100%;
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
