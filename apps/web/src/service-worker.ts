/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { version } from "$app/env";
import { assets, immutable } from "$app/manifest";

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `tomu-${version}`;
// Manifest paths come without a leading slash; the worker itself must never end up in its own cache.
const ASSETS = [...immutable, ...assets]
  .map((a) => `/${String(a.path).replace(/^\//, "")}`)
  .filter((path) => path !== "/service-worker.js");
// The single page app shell; the static host answers "/" with index.html.
const SHELL = "/";

sw.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll([...ASSETS, SHELL]);
      await sw.skipWaiting();
    })(),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Only this app's own files. The API and the WebSocket live on another origin and are never touched.
  if (url.origin !== sw.location.origin) return;

  if (request.mode === "navigate") {
    // Single page app: every route is answered by the one shell, from the network first so updates arrive.
    event.respondWith(fetch(request).catch(async () => (await caches.match(SHELL)) ?? Response.error()));
    return;
  }

  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
  }
});
