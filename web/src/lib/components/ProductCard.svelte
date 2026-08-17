<script lang="ts">
  import { untrack } from 'svelte';

  import type { Product, ProductColor, ProductStorageOption } from '$lib/schema';

  let { product }: { product: Product } = $props();

  const inr = new Intl.NumberFormat('en-IN');
  const initialColor = untrack(() =>
    Math.max(
      0,
      product.colors.findIndex((color) =>
        product.color_name ? color.name === product.color_name : color.family === product.color_family
      )
    )
  );
  const initialStorage = untrack(() =>
    Math.max(
      0,
      product.storage_options.findIndex(
        (option) => option.gb === product.storage_gb && (option.ram_gb ?? null) === (product.ram_gb ?? null)
      )
    )
  );

  let selectedColorIndex = $state(initialColor);
  let selectedStorageIndex = $state(initialStorage);
  let selectedColor = $derived<ProductColor | undefined>(product.colors[selectedColorIndex]);
  let selectedStorage = $derived<ProductStorageOption | undefined>(product.storage_options[selectedStorageIndex]);

  function rupees(value: number): string {
    return `₹${inr.format(value)}`;
  }

  function capacity(gb: number): string {
    if (gb >= 1024 && gb % 1024 === 0) return `${gb / 1024}TB`;
    if (gb >= 1000 && gb % 1000 === 0) return `${gb / 1000}TB`;
    return `${gb} GB`;
  }

  function storageText(option: ProductStorageOption): string {
    const storage = capacity(option.gb);
    return option.ram_gb ? `${option.ram_gb} GB + ${storage}` : storage;
  }
</script>

<article class="product-card">
  <div class="image-well">
    <img
      class="product-image"
      src={selectedColor?.image ?? product.image}
      alt={selectedColor ? `${product.name} in ${selectedColor.name}` : product.name}
    />
  </div>
  <div class="brand">{product.brand}</div>
  <div class="name">{product.name}</div>
  <div class="price">{rupees(selectedStorage?.price ?? product.price)}</div>

  <div class="swatches" aria-label="Colours">
    {#each product.colors as color, index (`${color.name}-${index}`)}
      <button
        class:swatch-empty={!color.hex}
        class:is-selected={index === selectedColorIndex}
        class="swatch"
        type="button"
        title={color.name}
        aria-label={`Show ${color.name}`}
        aria-pressed={index === selectedColorIndex}
        style:--swatch-color={color.hex}
        onclick={() => (selectedColorIndex = index)}
      ></button>
    {/each}
  </div>

  <div class="storage-options" aria-label="Storage options">
    {#each product.storage_options as option, index (`${option.ram_gb ?? 0}-${option.gb}-${index}`)}
      <button
        class:is-selected={index === selectedStorageIndex}
        class="storage-pill"
        type="button"
        aria-pressed={index === selectedStorageIndex}
        onclick={() => (selectedStorageIndex = index)}
      >
        {storageText(option)}
      </button>
    {/each}
  </div>
</article>
