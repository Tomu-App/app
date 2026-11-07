<script lang="ts">
  import { PUBLIC_API_URL } from "$app/env/public";
  import { startTomu, type Tomu } from "#lib/tomu/index.js";

  let tomu = $state.raw<Tomu | null>(null);

  $effect(() => {
    let current: Tomu | null = null;
    let cancelled = false;
    void startTomu({ apiUrl: PUBLIC_API_URL }).then((t) => {
      if (cancelled) void t.stop();
      else tomu = current = t;
    });
    return () => {
      cancelled = true;
      void current?.stop();
    };
  });
</script>

<h1>Tomu</h1>
<p>{tomu?.status ?? "starting"}</p>
