<script lang="ts">
  import type { Facet } from '$lib/schema';

  let { facets }: { facets: Facet[] } = $props();

  type CategoricalFacet = Extract<Facet, { type: 'categorical' }>;
  type RangeFacet = Extract<Facet, { type: 'range' }>;

  const inr = new Intl.NumberFormat('en-IN');

  function categorical(field: string): CategoricalFacet | undefined {
    return facets.find(
      (facet): facet is CategoricalFacet => facet.type === 'categorical' && facet.field === field
    );
  }

  function range(field: string): RangeFacet | undefined {
    return facets.find((facet): facet is RangeFacet => facet.type === 'range' && facet.field === field);
  }

  let brands = $derived(categorical('brand')?.values ?? []);
  let colors = $derived(categorical('color')?.values ?? []);
  let price = $derived(range('price'));
</script>

<aside class="filter-rail" aria-label="Filters">
  <h2 class="filter-title">Filters</h2>

  {#if brands.length}
    <section class="facet-group">
      <h3>Brand</h3>
      <ul class="facet-values">
        {#each brands as brand (brand.value)}
          <li><span>{brand.value}</span><span class="facet-count">{brand.count}</span></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if colors.length}
    <section class="facet-group">
      <h3>Colour</h3>
      <ul class="facet-values">
        {#each colors as color (color.value)}
          <li>
            <span class="facet-label">
              <span
                class:facet-swatch-empty={!color.hex}
                class="facet-swatch"
                style:background-color={color.hex}
                aria-hidden="true"
              ></span>
              {color.value}
            </span>
            <span class="facet-count">{color.count}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if price && (price.min || price.max)}
    <section class="facet-group facet-price">
      <h3>Price</h3>
      <div class="price-track" aria-hidden="true"><span></span></div>
      <div class="price-bounds">
        <span>₹{inr.format(price.min)}</span>
        <span>₹{inr.format(price.max)}</span>
      </div>
    </section>
  {/if}
</aside>
