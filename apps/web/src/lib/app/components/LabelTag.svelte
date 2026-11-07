<script lang="ts">
  import { labelText } from "#lib/app/lists.ts";
  import { m } from "#lib/paraglide/messages.js";
  import type { LabelInfo } from "#lib/tomu/index.js";

  let { label, plain = false }: { label: LabelInfo; plain?: boolean } = $props();
</script>

<span class="tag" class:shared={label.shared && !plain} class:plain>
  {labelText(label)}<span class="sr">, {label.shared ? m.label_shared() : m.label_private()}</span>
</span>

<style>
  .tag {
    display: inline-block;
    padding: 0.1rem 0.6rem;
    border: 2px solid var(--ink-soft);
    border-radius: var(--radius);
    color: var(--ink-soft);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.3;
  }
  /* Shared: filled in board blue, private: outlined grey. Never red. */
  .shared {
    background: var(--board);
    border-color: var(--board-text);
    color: var(--board-ink);
  }
  /* List sheet: plain capitals in board blue, no box. */
  .plain {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    color: var(--board-text);
    font-size: 1.125rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
