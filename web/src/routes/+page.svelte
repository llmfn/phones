<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>{data.sitename}</title>
</svelte:head>

<main>Hello, {data.sitename}</main>
