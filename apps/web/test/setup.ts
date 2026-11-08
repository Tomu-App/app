import "fake-indexeddb/auto";
import { vi } from "vitest";
import { setLocale } from "#lib/paraglide/runtime.js";

// jsdom reports en-US; tests assert the German texts.
setLocale("de", { reload: false });

// The shell reads the route from `$app/state`, which only exists inside a running SvelteKit app.
// Tests that need route params mock it themselves.
vi.mock("$app/state", () => import("./app-state.svelte.ts"));

// jsdom has no Web Animations API; Svelte's animate:flip asks for running animations of moved elements.
if (typeof Element !== "undefined" && !Element.prototype.getAnimations)
  Element.prototype.getAnimations = () => [];
