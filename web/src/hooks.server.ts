import { error } from '@sveltejs/kit';

import { ADMIN_SESSION_COOKIE, verifyAdminSession } from '$lib/server/admin-auth';
import { getSite } from '$lib/server/hosts';
import { resolveParticipantSite } from '$lib/server/participants';
import { resolveSiteConfig } from '$lib/server/site-config';

import type { Handle } from '@sveltejs/kit';

export const REVISION_HEADER = 'X-Phones-Revision';
export const REVISION_PARAM = 'r';

const ADMIN_HEADERS = {
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow'
};

function withAdminHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(ADMIN_HEADERS)) response.headers.set(name, value);
  return response;
}

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
  const pathname = event.url.pathname;

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (site.kind !== 'apex') error(404, 'Not found');

    event.locals.admin = await verifyAdminSession(
      event.cookies.get(ADMIN_SESSION_COOKIE),
      event.platform?.env.ADMIN_SESSION_SECRET
    );

    if (pathname !== '/admin/login' && !event.locals.admin) {
      if (event.request.method === 'GET' || event.request.method === 'HEAD') {
        return withAdminHeaders(
          new Response(null, { status: 303, headers: { location: '/admin/login' } })
        );
      }
      return withAdminHeaders(new Response('Unauthorized', { status: 401 }));
    }

    return withAdminHeaders(await resolve(event));
  }

  if (site.kind === 'instance' && event.platform?.env.DB) {
    const status = await resolveParticipantSite(event.platform.env.DB, site.slug);
    if (status === null || status === 'deleted') error(404, 'Site not found');
  }

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
