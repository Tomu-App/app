import "fake-indexeddb/auto";
import { setLocale } from "#lib/paraglide/runtime.js";

// jsdom reports en-US; tests assert the German texts.
setLocale("de", { reload: false });
