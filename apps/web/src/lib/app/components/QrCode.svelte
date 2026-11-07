<script lang="ts">
  import { encode } from "uqr";
  import { m } from "#lib/paraglide/messages.js";

  let { value }: { value: string } = $props();

  // Quiet zone of 4 modules on each side, as the QR standard asks. Error correction M.
  const BORDER = 4;
  const qr = $derived(encode(value, { ecc: "M", border: 0 }));
  const size = $derived(qr.size + BORDER * 2);
  // One horizontal run of dark modules per segment: "M x y h<run>v1h-<run>z".
  const path = $derived.by(() => {
    const parts: string[] = [];
    qr.data.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (!row[x]) {
          x++;
          continue;
        }
        const start = x;
        while (x < row.length && row[x]) x++;
        parts.push(`M${start + BORDER} ${y + BORDER}h${x - start}v1h-${x - start}z`);
      }
    });
    return parts.join("");
  });
</script>

<!-- Black on white in light and dark mode: scanners need the contrast. Drawn with attributes only, no inline script. -->
<svg role="img" aria-label={m.share_qr_alt()} viewBox="0 0 {size} {size}" shape-rendering="crispEdges">
  <rect width={size} height={size} fill="#ffffff" />
  <path d={path} fill="#000000" />
</svg>

<style>
  svg {
    display: block;
    width: min(100%, 18rem);
    height: auto;
    margin-inline: auto;
    border-radius: var(--radius);
  }
</style>
