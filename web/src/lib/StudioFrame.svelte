<script lang="ts">
  import type { Snippet } from 'svelte';

  import type { SiteConfig } from '$lib/site-config';
  import { PROMPTS } from '$lib/site-defaults';

  interface PanelData {
    slug: string;
    sitename: string;
    config: SiteConfig;
    revision: number;
    live: number;
  }

  let {
    data,
    here,
    eyebrow,
    title,
    children
  }: {
    data: PanelData;
    /** This panel's own path, so the rail can mark itself. */
    here: string;
    eyebrow: string;
    title: string;
    children: Snippet;
  } = $props();

  /**
   * The rail, in schema order: a section per part of the config, and prompts
   * listed one by one because each is edited on its own.
   */
  const PANELS: { label: string; href?: string; items?: { label: string; href: string }[] }[] = [
    { label: 'Search', href: '/studio' },
    {
      label: 'Prompts',
      items: PROMPTS.map(({ name }) => ({ label: name, href: `/studio/prompts/${name}` }))
    }
  ];

  const readOnly = $derived(data.revision !== data.live);
  const appHref = $derived(readOnly ? `/?r=${data.revision}` : '/');

  /** Moving between panels stays on the revision being viewed. */
  const panelHref = (href: string) => (readOnly ? `${href}?r=${data.revision}` : href);
</script>

<svelte:head>
  <title>{data.slug} studio</title>
</svelte:head>

<div class="studio">
  <header class="studio-head">
    <a class="wordmark" href="/">{data.sitename}</a>
    <p class="studio-revision">
      rev {data.revision}
      <span class="studio-revision-state">{readOnly ? 'archived' : 'live'}</span>
    </p>
    <a class="nav-link" href={appHref}>View app</a>
  </header>

  <div class="studio-body">
    <nav class="studio-rail" aria-label="Configuration">
      {#snippet railItem(label: string, href: string, nested: boolean)}
        <a
          class="studio-rail-item"
          class:is-nested={nested}
          class:is-current={href === here}
          href={panelHref(href)}
          aria-current={href === here ? 'page' : undefined}
        >
          {label}
        </a>
      {/snippet}

      {#each PANELS as panel (panel.label)}
        {#if panel.items}
          <p class="studio-rail-group">{panel.label}</p>
          {#each panel.items as item (item.href)}
            {@render railItem(item.label, item.href, true)}
          {/each}
        {:else if panel.href}
          {@render railItem(panel.label, panel.href, false)}
        {/if}
      {/each}
    </nav>

    <main class="studio-panel">
      <section class="editorial-panel">
        <p class="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>

        {#if readOnly}
          <p class="hint">
            Revision {data.revision} is not live, so it is read only. Revision {data.live} is what
            your site serves.
          </p>
        {/if}

        {@render children()}
      </section>

      <form class="studio-signout" method="POST" action="?/logout">
        <button class="button button-secondary" type="submit">Log out</button>
      </form>
    </main>
  </div>
</div>
