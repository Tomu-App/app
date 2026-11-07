import { version } from "$app/env";
import { assets, immutable } from "$app/manifest";
import { resolve } from "$app/paths";
import { self } from "$app/service-worker";

const CACHE = `tomu-${version}`;
// Manifest paths are relative to the base path; resolving them gives the pathnames the fetch handler sees.
// The worker itself must never end up in its own cache.
// Build files are not routes, so the typed `resolve` does not accept them: the cast only satisfies the types.
const pathOf = (file: string): string => resolve(file as "/");
const ASSETS: string[] = [...immutable, ...assets]
  .map((a) => pathOf(a.path))
  .filter((path) => path !== pathOf("service-worker.js"));
// The single page app shell; the static host answers "/" with index.html.
const SHELL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll([...ASSETS, SHELL]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Only this app's own files. The API and the WebSocket live on another origin and are never touched.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Single page app: every route is answered by the one shell, from the network first so updates arrive.
    event.respondWith(fetch(request).catch(async () => (await caches.match(SHELL)) ?? Response.error()));
    return;
  }

  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
  }
});
