import type { CataloguePhone, Product } from '$lib/schema';

import { CATALOGUE } from './catalogue.generated';

export function projectProduct(phone: CataloguePhone): Product {
  const leadColor = phone.colors[0];
  const leadStorage = phone.storage_options[0];
  if (!leadColor || !leadStorage) throw new Error(`Phone ${phone.id} has no purchasable options`);

  return {
    id: phone.id,
    name: phone.name,
    brand: phone.brand,
    price: leadStorage.price,
    image: leadColor.image,
    variant_id: `${phone.id}-${leadColor.family}-${leadStorage.gb}`,
    color_name: leadColor.name,
    color_family: leadColor.family,
    storage_gb: leadStorage.gb,
    storage_label: leadStorage.label,
    ...(leadStorage.ram_gb === undefined ? {} : { ram_gb: leadStorage.ram_gb }),
    colors: phone.colors.map((color) => ({
      name: color.name,
      family: color.family,
      ...(color.hex === undefined ? {} : { hex: color.hex }),
      image: color.image
    })),
    storage_options: phone.storage_options.map((option) => ({
      gb: option.gb,
      label: option.label,
      ...(option.ram_gb === undefined ? {} : { ram_gb: option.ram_gb }),
      price: option.price
    }))
  };
}

export { CATALOGUE };
