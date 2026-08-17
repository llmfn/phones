<script lang="ts">
  import type { Facet, FacetValue, Filters, PriceRange } from '$lib/schema';

  type FilterField = 'brands' | 'colors';
  type CategoricalFacet = Extract<Facet, { type: 'categorical' }>;

  let {
    facets,
    filters,
    priceBounds,
    ontoggle,
    onprice,
    onreset
  }: {
    facets: Facet[];
    filters: Filters;
    priceBounds: PriceRange | null;
    ontoggle: (field: FilterField, value: string) => void;
    onprice: (price: PriceRange | null) => void;
    onreset: () => void;
  } = $props();

  const inr = new Intl.NumberFormat('en-IN');
  const step = 500;

  function categorical(field: string): CategoricalFacet | undefined {
    return facets.find(
      (facet): facet is CategoricalFacet => facet.type === 'categorical' && facet.field === field
    );
  }

  function withSelected(values: CategoricalFacet['values'], selected: string[]): FacetValue[] {
    const present = new Set(values.map((value) => value.value));
    return [...values, ...selected.filter((value) => !present.has(value)).map((value) => ({ value, count: 0 }))];
  }

  let brands = $derived(withSelected(categorical('brand')?.values ?? [], filters.brands));
  let colors = $derived(withSelected(categorical('color')?.values ?? [], filters.colors));
  let hasFilters = $derived(Boolean(filters.brands.length || filters.colors.length || filters.price));
  let low = $state(0);
  let high = $state(0);

  $effect(() => {
    if (!priceBounds) return;
    low = filters.price?.min ?? priceBounds.min;
    high = filters.price?.max ?? priceBounds.max;
  });

  let lowPosition = $derived(
    priceBounds && priceBounds.max > priceBounds.min
      ? ((low - priceBounds.min) / (priceBounds.max - priceBounds.min)) * 100
      : 0
  );
  let highPosition = $derived(
    priceBounds && priceBounds.max > priceBounds.min
      ? ((high - priceBounds.min) / (priceBounds.max - priceBounds.min)) * 100
      : 100
  );

  function moveLow(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    low = Math.min(Number(input.value), high);
    input.value = String(low);
  }

  function moveHigh(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    high = Math.max(Number(input.value), low);
    input.value = String(high);
  }

  function commitPrice() {
    if (!priceBounds) return;
    onprice(low === priceBounds.min && high === priceBounds.max ? null : { min: low, max: high });
  }
</script>

<aside class="filter-rail" aria-label="Filters">
  <div class="filter-heading">
    <h2 class="filter-title">Filters</h2>
    {#if hasFilters}<button class="filter-reset" type="button" onclick={onreset}>Reset</button>{/if}
  </div>

  {#if brands.length}
    <section class="facet-group">
      <h3>Brand</h3>
      <ul class="facet-values">
        {#each brands as brand (brand.value)}
          <li>
            <label class="facet-option">
              <input
                type="checkbox"
                checked={filters.brands.includes(brand.value)}
                onchange={() => ontoggle('brands', brand.value)}
              />
              <span>{brand.value}</span>
            </label>
            <span class="facet-count">{brand.count}</span>
          </li>
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
            <label class="facet-option">
              <input
                type="checkbox"
                checked={filters.colors.includes(color.value)}
                onchange={() => ontoggle('colors', color.value)}
              />
              <span class="facet-label">
                <span
                  class:facet-swatch-empty={!color.hex}
                  class="facet-swatch"
                  style:background-color={color.hex}
                  aria-hidden="true"
                ></span>
                {color.value}
              </span>
            </label>
            <span class="facet-count">{color.count}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if priceBounds}
    <section class="facet-group facet-price">
      <h3>Price</h3>
      {#if priceBounds.max > priceBounds.min}
        <div
          class:price-ranges-equal={low === high}
          class="price-slider"
          style:--price-low={`${lowPosition}%`}
          style:--price-high={`${highPosition}%`}
        >
          <div class="price-track" aria-hidden="true"></div>
          <input
            class="price-range price-range-low"
            type="range"
            aria-label="Minimum price"
            min={priceBounds.min}
            max={high}
            {step}
            value={low}
            oninput={moveLow}
            onchange={commitPrice}
          />
          <input
            class="price-range price-range-high"
            type="range"
            aria-label="Maximum price"
            min={low}
            max={priceBounds.max}
            {step}
            value={high}
            oninput={moveHigh}
            onchange={commitPrice}
          />
        </div>
      {/if}
      <div class="price-bounds">
        <span>₹{inr.format(low)}</span>
        <span>₹{inr.format(high)}</span>
      </div>
    </section>
  {/if}
</aside>
