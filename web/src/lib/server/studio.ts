import { dev } from '$app/environment';
import { error, fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

import { getAuthSecret, verifyCredential } from '$lib/server/auth';
import { SESSION_COOKIE } from '$lib/server/cookies';
import type { Database } from '$lib/server/database';
import { getSite } from '$lib/server/hosts';
import { appendRevision, ensureSite, listRevisions, loadRevision } from './revisions';
import { getSitename } from '$lib/server/sitename';
import { parseSiteConfig, type SiteConfig } from '$lib/site-config';

export interface StudioSession {
  slug: string;
  db: Database;
}

export interface PanelData {
  slug: string;
  sitename: string;
  config: SiteConfig;
  revision: number;
  live: number;
}

/**
 * Admit a signed-in student to their own studio, creating the site if needed.
 *
 * Every panel goes through here, so the check lives in one place rather than
 * once per route.
 */
export async function requireStudio(event: RequestEvent): Promise<StudioSession> {
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

/** What every panel renders from: the config it edits and where it stands. */
export async function loadPanel(event: RequestEvent): Promise<PanelData> {
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
}

/**
 * Append a revision holding one panel's section of the config.
 *
 * The patch lands on top of the live document rather than on the one the panel
 * was rendered from, so a panel can only ever change its own section — saving
 * prompts cannot walk back a search setting saved in another tab.
 */
export async function savePanel(
  event: RequestEvent,
  /**
   * One section of the document, straight off the form and not yet valid.
   * Built from the live config rather than closed over the rendered one, so a
   * panel editing a single field carries its siblings forward as they stand.
   */
  patch: (live: SiteConfig) => Record<string, unknown>,
  note: FormDataEntryValue | null,
  back: string
) {
  const { slug, db } = await requireStudio(event);

  const revisions = await listRevisions(db, slug);
  const live = revisions[0].revision;
  if (event.locals.revision !== null && event.locals.revision !== live) {
    return fail(409, { error: 'Only the live revision can be edited' });
  }

  const current = (await loadRevision(db, slug, live))?.config ?? parseSiteConfig({});
  let config;
  try {
    config = parseSiteConfig({ ...current, ...patch(current) });
  } catch (invalid) {
    return fail(400, { error: invalid instanceof Error ? invalid.message : String(invalid) });
  }

  const summary = typeof note === 'string' && note.trim() ? note.trim() : null;
  await appendRevision(db, slug, config, summary);
  redirect(303, back);
}

export function logout({ cookies, url }: RequestEvent) {
  cookies.delete(SESSION_COOKIE, {
    path: '/',
    secure: url.protocol === 'https:'
  });
  redirect(303, '/');
}
