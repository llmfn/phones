import { error } from '@sveltejs/kit';

import { getSite } from '$lib/server/hosts';
import { resolveSiteConfig } from '$lib/server/site-config';

import type { Handle } from '@sveltejs/kit';

export const REVISION_HEADER = 'X-Phones-Revision';
export const REVISION_PARAM = 'r';

/**
 * Read the revision a request asks for, or null for the live one.
 *
 * The header wins over the query parameter, so there is one resolution order
 * everywhere. Returns undefined when what was asked for cannot be a revision.
 */
function readRevision(request: Request, url: URL): number | null | undefined {
  const asked = request.headers.get(REVISION_HEADER) ?? url.searchParams.get(REVISION_PARAM);
  if (asked === null) return null;

  const revision = Number(asked);
  return Number.isInteger(revision) && revision > 0 ? revision : undefined;
}

export const handle: Handle = async ({ event, resolve }) => {
  const site = getSite(event.url);
  const revision = readRevision(event.request, event.url);
  const loaded =
    revision === undefined
      ? null
      : await resolveSiteConfig(
          event.platform?.env.DB,
          site.kind === 'instance' ? site.slug : null,
          revision
        );

  if (!loaded) error(404, 'Unknown revision');

  event.locals.config = loaded.config;
  event.locals.revision = loaded.revision;
  return resolve(event);
};
