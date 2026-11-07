import { getContext, setContext } from "svelte";
import type { Tomu } from "#lib/tomu/index.js";

export const TOMU_KEY = Symbol("tomu");

/** Called once by the root layout. */
export const setTomu = (tomu: Tomu): void => void setContext(TOMU_KEY, tomu);

/** The running `Tomu` of this tab; throws when called outside the root layout. */
export const getTomu = (): Tomu => {
  const tomu = getContext<Tomu | undefined>(TOMU_KEY);
  if (!tomu) throw new Error("Tomu context missing: call getTomu() below the root layout");
  return tomu;
};
