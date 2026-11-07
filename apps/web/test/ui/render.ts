import { render, type RenderResult } from "@testing-library/svelte";
import type { Component, ComponentProps } from "svelte";
import { PENDING_KEY, TOMU_KEY } from "#lib/app/context.ts";
import { PendingDeletes } from "#lib/app/undo.svelte.ts";
import type { Tomu } from "#lib/tomu/index.js";

/**
 * Renders a component with `tomu` and `pending` provided through the app context, as the shell does.
 * Without a `pending`, a fresh one is used.
 */
export const renderWithTomu = <C extends Component<any>>(
  component: C,
  props: ComponentProps<C>,
  tomu: Tomu,
  pending: PendingDeletes = new PendingDeletes(),
): RenderResult<C> =>
  render(component as never, {
    props,
    context: new Map<symbol, unknown>([
      [TOMU_KEY, tomu],
      [PENDING_KEY, pending],
    ]),
  }) as RenderResult<C>;
