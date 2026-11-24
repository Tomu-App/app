<!-- `<svelte:head>` cannot sit inside a block; this can, so a screen that replaces the page names itself here. -->
<script lang="ts">
  let { title }: { title: string } = $props();
</script>

<svelte:head><title>{title}</title></svelte:head>
