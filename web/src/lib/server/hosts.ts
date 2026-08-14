export const APEX_HOSTNAMES = ['phones.llmfn.com', 'local.pipal.in'] as const;

const DEFAULT_APEX_HOSTNAME = APEX_HOSTNAMES[0];
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

export type Site =
  | { kind: 'apex'; hostname: string; apexHostname: string }
  | { kind: 'instance'; hostname: string; apexHostname: string; slug: string };

export function getSite(url: URL): Site {
  const hostname = url.hostname.toLowerCase();

  if (APEX_HOSTNAMES.some((apex) => hostname === apex)) {
    return { kind: 'apex', hostname, apexHostname: hostname };
  }

  const apexHostname =
    APEX_HOSTNAMES.find((apex) => hostname.endsWith(`.${apex}`)) ??
    DEFAULT_APEX_HOSTNAME;

  return {
    kind: 'instance',
    hostname,
    apexHostname,
    slug: hostname.split('.')[0]
  };
}

export function getSlugFromEmail(email: string): string | null {
  if (!EMAIL_PATTERN.test(email)) return null;

  const separator = email.lastIndexOf('@');
  const slug = email
    .slice(0, separator)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 63)
    .replace(/^-+|-+$/g, '');

  return isValidSlug(slug) ? slug : null;
}

export function isValidSlug(slug: string): boolean {
  return slug.length <= 63 && SLUG_PATTERN.test(slug);
}

export function getOwnerEmail(slug: string): string {
  return `${slug}@gmail.com`;
}

export function getMaskedOwnerEmail(slug: string): string {
  return `${slug.slice(0, 1)}***@gmail.com`;
}

export function getSiteUrl(
  currentUrl: URL,
  apexHostname: string,
  slug: string | null,
  path = '/'
): URL {
  const target = new URL(path, currentUrl);
  target.hostname = slug ? `${slug}.${apexHostname}` : apexHostname;
  return target;
}
