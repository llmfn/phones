<script lang="ts">
  import { pushState } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';

  import FilterRail from '$lib/components/FilterRail.svelte';
  import ProductCard from '$lib/components/ProductCard.svelte';
  import TracePanel from '$lib/components/TracePanel.svelte';
  import { recommend } from '$lib/recommend';
  import type { Facet, Filters, PriceRange, Product, TraceTurn } from '$lib/schema';
  import { readSearchQuery, writeSearchQuery } from '$lib/search-url';

  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let query = $state('');
  let searchedQuery = $state('');
  let searched = $state(false);
  let loading = $state(false);
  let products = $state<Product[]>([]);
  let facets = $state<Facet[]>([]);
  let filters = $state<Filters>({ brands: [], colors: [], price: null });
  let priceBounds = $state<PriceRange | null>(null);
  let turns = $state<TraceTurn[]>([]);
  let error = $state<string | null>(null);
  let resultVersion = $state(0);
  let activeRequest: AbortController | null = null;

  const inr = new Intl.NumberFormat('en-IN');

  function emptyFilters(): Filters {
    return { brands: [], colors: [], price: null };
  }

  function filtersActive(value: Filters) {
    return Boolean(value.brands.length || value.colors.length || value.price);
  }

  async function runSearch(nextQuery: string, nextFilters: Filters = filters) {
    const normalizedQuery = nextQuery.trim();
    searchedQuery = normalizedQuery;
    filters = nextFilters;
    searched = true;
    error = null;
    turns = [];

    activeRequest?.abort();
    const request = new AbortController();
    activeRequest = request;
    loading = true;

    try {
      const result = await recommend(normalizedQuery, nextFilters, {
        signal: request.signal,
        revision: data.revision
      });
      if (request.signal.aborted) return;
      products = result.products;
      facets = result.facets;
      if (!filtersActive(nextFilters)) {
        const price = result.facets.find(
          (facet): facet is Extract<Facet, { type: 'range' }> => facet.type === 'range' && facet.field === 'price'
        );
        priceBounds = price && (price.min || price.max)
          ? { min: Math.floor(price.min / 500) * 500, max: Math.ceil(price.max / 500) * 500 }
          : null;
      }
      if (result.trace) {
        turns = [result.trace];
        error = result.trace.status === 'error' ? (result.trace.error ?? 'Search failed') : null;
      }
      resultVersion += 1;
    } catch (caught) {
      if (request.signal.aborted) return;
      products = [];
      facets = [];
      resultVersion += 1;
      error = caught instanceof Error ? caught.message : 'Search failed';
    } finally {
      if (activeRequest === request) {
        activeRequest = null;
        loading = false;
      }
    }
  }

  function clearSearch() {
    activeRequest?.abort();
    activeRequest = null;
    query = '';
    searchedQuery = '';
    searched = false;
    loading = false;
    products = [];
    facets = [];
    filters = emptyFilters();
    priceBounds = null;
    turns = [];
    error = null;
    resultVersion += 1;
  }

  function search(event: SubmitEvent) {
    event.preventDefault();
    const nextUrl = writeSearchQuery(new URL(window.location.href), query);
    if (nextUrl.href !== window.location.href) pushState(nextUrl, {});
    priceBounds = null;
    void runSearch(query, emptyFilters());
  }

  function toggleFilter(field: 'brands' | 'colors', value: string) {
    const values = filters[field].includes(value)
      ? filters[field].filter((item) => item !== value)
      : [...filters[field], value];
    void runSearch(searchedQuery, { ...filters, [field]: values });
  }

  function setPrice(price: PriceRange | null) {
    void runSearch(searchedQuery, { ...filters, price });
  }

  function resetFilters() {
    void runSearch(searchedQuery, emptyFilters());
  }

  function removeFilter(field: 'brands' | 'colors', value: string) {
    void runSearch(searchedQuery, { ...filters, [field]: filters[field].filter((item) => item !== value) });
  }

  onMount(() => {
    if (data.page === 'apex') return;

    function restoreSearch() {
      const restoredQuery = readSearchQuery(new URL(window.location.href));
      if (restoredQuery === null) {
        clearSearch();
      } else {
        query = restoredQuery;
        priceBounds = null;
        void runSearch(restoredQuery, emptyFilters());
      }
    }

    restoreSearch();
    window.addEventListener('popstate', restoreSearch);
    return () => window.removeEventListener('popstate', restoreSearch);
  });

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
      <div class="search-stack">
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
        {#if filtersActive(filters)}
          <div class="filter-chips" aria-label="Active filters">
            {#each filters.brands as brand (brand)}
              <button type="button" onclick={() => removeFilter('brands', brand)}>brand: {brand}<span>×</span></button>
            {/each}
            {#each filters.colors as color (color)}
              <button type="button" onclick={() => removeFilter('colors', color)}>colour: {color}<span>×</span></button>
            {/each}
            {#if filters.price}
              <button type="button" onclick={() => setPrice(null)}>
                price: ₹{inr.format(filters.price.min)}–₹{inr.format(filters.price.max)}<span>×</span>
              </button>
            {/if}
            <button class="clear-filters" type="button" onclick={resetFilters}>clear all</button>
          </div>
        {/if}
      </div>
      <nav class="tool-links" aria-label="Student tools">
        <a class="nav-link" href="/studio">llmfn studio</a>
      </nav>
    </header>

    {#if searched}
      <div class="student-content">
        <FilterRail
          {facets}
          {filters}
          {priceBounds}
          ontoggle={toggleFilter}
          onprice={setPrice}
          onreset={resetFilters}
        />
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
      </div>
    {/if}

    {#if turns.length}<TracePanel {turns} />{/if}
  </main>
{/if}
