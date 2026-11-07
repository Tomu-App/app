import { getContext, setContext } from "svelte";
import type { Tomu } from "#lib/tomu/index.js";
import type { InstallHint } from "./install.svelte.ts";
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

export const INSTALL_KEY = Symbol("install-hint");

/** Called once by the shell, so the install prompt is caught from app start. */
export const setInstall = (hint: InstallHint): void => void setContext(INSTALL_KEY, hint);

/** The install hint of this tab; throws when called outside the shell. */
export const getInstall = (): InstallHint => {
  const hint = getContext<InstallHint | undefined>(INSTALL_KEY);
  if (!hint) throw new Error("Install context missing: call getInstall() below the shell");
  return hint;
};
