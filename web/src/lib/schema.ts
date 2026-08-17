export interface CatalogueColor {
  name: string;
  family: string;
  hex?: string;
  image: string;
}

export interface CatalogueStorageOption {
  gb: number;
  label: string;
  ram_gb?: number;
  price: number;
}

export interface CataloguePhone {
  id: string;
  brand: string;
  name: string;
  narrative: string;
  specs: Record<string, unknown>;
  signals: {
    use_cases: string[];
    personas: string[];
    price_segment: string;
  };
  colors: CatalogueColor[];
  storage_options: CatalogueStorageOption[];
}

export interface ProductColor {
  name: string;
  family: string;
  hex?: string;
  image: string;
}

export interface ProductStorageOption {
  gb: number;
  label: string;
  ram_gb?: number;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  price: number;
  image: string;
  variant_id: string;
  color_name: string;
  color_family: string;
  storage_gb: number;
  storage_label: string;
  ram_gb?: number;
  colors: ProductColor[];
  storage_options: ProductStorageOption[];
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface Filters {
  brands: string[];
  colors: string[];
  price: PriceRange | null;
}

export interface FacetValue {
  value: string;
  count: number;
  hex?: string;
}

export type Facet =
  | { type: 'categorical'; field: string; values: FacetValue[] }
  | { type: 'range'; field: string; min: number; max: number };

export interface TraceStep {
  layer: number;
  name: string;
  label: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  status: 'success' | 'fallback' | 'error' | 'skip' | 'running';
  latency_ms: number;
}

export interface TraceTurn {
  kind: 'search' | 'chat';
  input: string;
  steps: TraceStep[];
  status: 'success' | 'error';
  latency_ms: number;
  error?: string;
}

export interface SearchResult {
  products: Product[];
  facets: Facet[];
  trace?: TraceTurn;
  summary?: string;
  session_id?: string;
}
