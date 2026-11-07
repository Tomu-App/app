import { render, type RenderResult } from "@testing-library/svelte";
import type { Component, ComponentProps } from "svelte";
import { TOMU_KEY } from "#lib/app/context.ts";
import type { Tomu } from "#lib/tomu/index.js";

/** Renders a component with `tomu` provided through the app context, as the root layout does. */
export const renderWithTomu = <C extends Component<any>>(
  component: C,
  props: ComponentProps<C>,
  tomu: Tomu,
): RenderResult<C> => render(component as never, { props, context: new Map([[TOMU_KEY, tomu]]) }) as RenderResult<C>;
