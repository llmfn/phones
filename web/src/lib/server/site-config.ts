import { parseSiteConfig, type SiteConfig } from '$lib/site-config';

// Revisions replace this bundled document as the source; callers keep using this seam.
const BUNDLED_SITE_CONFIG = {};

export function resolveSiteConfig(): SiteConfig {
  return parseSiteConfig(BUNDLED_SITE_CONFIG);
}
