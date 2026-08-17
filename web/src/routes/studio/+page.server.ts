import { dev } from '$app/environment';
import { error, fail, redirect } from '@sveltejs/kit';

import { getAuthSecret, verifyCredential } from '$lib/server/auth';
import { SESSION_COOKIE } from '$lib/server/cookies';
import { getSite } from '$lib/server/hosts';
import {
  appendRevision,
  ensureSite,
  listRevisions,
  loadRevision,
  type Database
} from '$lib/server/revisions';
import { getSitename } from '$lib/server/sitename';
import { parseSiteConfig } from '$lib/site-config';

import type { Actions, PageServerLoad, RequestEvent } from './$types';

/** The knobs a save may carry, each belonging to exactly one search method. */
const SEARCH_PARAMS = ['k1', 'b', 'min_score'] as const;

async function requireStudio(event: RequestEvent): Promise<{ slug: string; db: Database }> {
  const site = getSite(event.url);
  if (site.kind === 'apex') redirect(303, '/');

  let signedIn = false;
  try {
    const secret = getAuthSecret(event.platform, dev);
    signedIn = await verifyCredential(
      event.cookies.get(SESSION_COOKIE),
      'session',
      site.hostname,
      secret
    );
  } catch {
    // Missing production configuration behaves like a signed-out session.
  }
  if (!signedIn) redirect(303, '/studio/login');

  const db = event.platform?.env.DB;
  if (!db) error(503, 'No configuration database is bound');

  await ensureSite(db, site.slug);
  return { slug: site.slug, db };
}

export const load: PageServerLoad = async (event) => {
  const { slug, db } = await requireStudio(event);

  const revisions = await listRevisions(db, slug);
  const live = revisions[0].revision;
  // The hook has already resolved and range-checked `?r=`, so an unknown
  // revision never reaches this far.
  const revision = event.locals.revision ?? live;
  const loaded = await loadRevision(db, slug, revision);

  return {
    slug,
    sitename: getSitename(event.request),
    config: loaded?.config ?? parseSiteConfig({}),
    revision,
    live
  };
};

export const actions: Actions = {
  save: async (event) => {
    const { slug, db } = await requireStudio(event);

    const revisions = await listRevisions(db, slug);
    const live = revisions[0].revision;
    if (event.locals.revision !== null && event.locals.revision !== live) {
      return fail(409, { error: 'Only the live revision can be edited' });
    }

    const form = await event.request.formData();
    const note = form.get('note');

    // Every knob the form carries is offered to the parser, rather than only
    // the ones the chosen method knows, so a param from another method is a
    // rejected save instead of a field silently dropped.
    const search_params: Record<string, unknown> = {};
    for (const name of SEARCH_PARAMS) {
      const value = form.get(name);
      if (typeof value === 'string' && value.trim() !== '') {
        search_params[name] = Number(value);
      }
    }

    const current = (await loadRevision(db, slug, live))?.config ?? parseSiteConfig({});
    let config;
    try {
      config = parseSiteConfig({
        ...current,
        search: { method: form.get('method') ?? undefined, search_params }
      });
    } catch (invalid) {
      return fail(400, { error: invalid instanceof Error ? invalid.message : String(invalid) });
    }

    const summary = typeof note === 'string' && note.trim() ? note.trim() : null;
    await appendRevision(db, slug, config, summary);
    redirect(303, '/studio');
  },

  logout: ({ cookies, url }) => {
    cookies.delete(SESSION_COOKIE, {
      path: '/',
      secure: url.protocol === 'https:'
    });
    redirect(303, '/');
  }
};
