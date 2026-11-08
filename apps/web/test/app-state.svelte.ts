/** Reactive stand-in for SvelteKit's `page` from `$app/state`; tests set `page.url` to change the route. */
export const page = $state({
  url: new URL("http://localhost/"),
  params: {} as Record<string, string>,
});
