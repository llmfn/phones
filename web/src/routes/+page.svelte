<script lang="ts">
  import { onDestroy } from 'svelte';

  import ProductCard from '$lib/components/ProductCard.svelte';
  import TracePanel from '$lib/components/TracePanel.svelte';
  import { recommend } from '$lib/recommend';
  import type { Product, TraceTurn } from '$lib/schema';

  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let query = $state('');
  let searched = $state(false);
  let loading = $state(false);
  let products = $state<Product[]>([]);
  let turns = $state<TraceTurn[]>([]);
  let error = $state<string | null>(null);
  let resultVersion = $state(0);
  let activeRequest: AbortController | null = null;

  async function search(event: SubmitEvent) {
    event.preventDefault();
    query = query.trim();
    searched = true;
    error = null;
    turns = [];

    activeRequest?.abort();
    const request = new AbortController();
    activeRequest = request;
    loading = true;

    try {
      const result = await recommend(query, request.signal);
      if (request.signal.aborted) return;
      products = result.products;
      if (result.trace) {
        turns = [result.trace];
        error = result.trace.status === 'error' ? (result.trace.error ?? 'Search failed') : null;
      }
      resultVersion += 1;
    } catch (caught) {
      if (request.signal.aborted) return;
      products = [];
      resultVersion += 1;
      error = caught instanceof Error ? caught.message : 'Search failed';
    } finally {
      if (activeRequest === request) {
        activeRequest = null;
        loading = false;
      }
    }
  }

  onDestroy(() => activeRequest?.abort());
</script>

<svelte:head>
  <title>{data.page === 'apex' ? 'Find your Phones app' : data.sitename}</title>
</svelte:head>

{#if data.page === 'apex'}
  <div class="apex-page">
    <header class="site-nav">
      <a class="wordmark" href="/">Phones</a>
      <span class="eyebrow">LLMFN</span>
    </header>
    <main class="apex-main">
      <section class="editorial-panel">
        <p class="eyebrow">Your course workspace</p>
        <h1>Find your phone lab.</h1>
        <p class="intro">
          Enter your course email to open your personal recommender and continue your work.
        </p>

        <form class="finder-form" method="POST">
          <label class="field-label" for="email">Email address</label>
          <div class="field-row">
            <input
              class="form-input"
              id="email"
              name="email"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              value={form && 'email' in form ? form.email : ''}
              required
            />
            <button class="button" type="submit">Open app</button>
          </div>
          {#if form?.error}<p class="error">{form.error}</p>{/if}
        </form>
      </section>
    </main>
  </div>
{:else}
  <main class:has-searched={searched} class:has-trace={turns.length > 0} class="student-home">
    <header class="student-topbar">
      <div class="student-brand">
        <a class="wordmark" href="/">Phones</a>
        {#if loading}<span class="spinner" role="status" aria-label="Loading"></span>{/if}
      </div>
      <form class="search" role="search" onsubmit={search}>
        <svg
          class="search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-3.8-3.8"></path>
        </svg>
        <input
          class="search-input"
          type="search"
          placeholder="Find a phone - describe what you need"
          autocomplete="off"
          aria-label="Search phones"
          bind:value={query}
        />
      </form>
      <nav class="tool-links" aria-label="Student tools">
        <a class="nav-link" href="/admin">Admin</a>
      </nav>
    </header>

    {#if searched}
      <section class="student-results" aria-label="Results" aria-busy={loading}>
        <div class="results-announcement" aria-live="polite">
          {#if error}
            <p class="results-error">{error}</p>
          {:else if products.length || !loading}
            <div class="results-head">{products.length} result{products.length === 1 ? '' : 's'}</div>
          {/if}
        </div>

        {#if !error}
          {#if !products.length && !loading}
            <p class="empty">No phones match - try a broader search.</p>
          {:else}
            <div class="results-grid">
              {#each products as product (`${resultVersion}-${product.id}`)}
                <ProductCard {product} />
              {/each}
            </div>
          {/if}
        {/if}
      </section>
    {/if}

    {#if turns.length}<TracePanel {turns} />{/if}
  </main>
{/if}
