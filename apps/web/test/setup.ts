import "fake-indexeddb/auto";
import { setLocale } from "#lib/paraglide/runtime.js";

// jsdom reports en-US; tests assert the German texts.
setLocale("de", { reload: false });

// jsdom has no Web Animations API; Svelte's animate:flip asks for running animations of moved elements.
if (typeof Element !== "undefined" && !Element.prototype.getAnimations) Element.prototype.getAnimations = () => [];
