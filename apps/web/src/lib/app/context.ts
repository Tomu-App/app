import { getContext, setContext } from "svelte";
import type { Tomu } from "#lib/tomu/index.js";
import type { PendingDeletes } from "./undo.svelte.ts";

export const TOMU_KEY = Symbol("tomu");

/** Called once by the root layout. */
export const setTomu = (tomu: Tomu): void => void setContext(TOMU_KEY, tomu);

/** The running `Tomu` of this tab; throws when called outside the root layout. */
export const getTomu = (): Tomu => {
  const tomu = getContext<Tomu | undefined>(TOMU_KEY);
  if (!tomu) throw new Error("Tomu context missing: call getTomu() below the root layout");
  return tomu;
};

export const PENDING_KEY = Symbol("pending-deletes");

/** Called once by the shell, next to `setTomu`. */
export const setPending = (pending: PendingDeletes): void => void setContext(PENDING_KEY, pending);

/** The waiting deletes of this tab; throws when called outside the shell. */
export const getPending = (): PendingDeletes => {
  const pending = getContext<PendingDeletes | undefined>(PENDING_KEY);
  if (!pending) throw new Error("Pending context missing: call getPending() below the shell");
  return pending;
};
