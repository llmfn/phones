import { fail, redirect } from '@sveltejs/kit';

import { getSite, getSiteUrl, getSlugFromEmail } from '$lib/server/hosts';
import { getParticipantBySubdomain, resolveParticipantSite } from '$lib/server/participants';
import { ensureSite } from '$lib/server/revisions';
import { getSitename } from '$lib/server/sitename';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, request, url }) => {
  const site = getSite(url);

  if (site.kind === 'instance') {
    return { page: 'app' as const, sitename: getSitename(request), revision: locals.revision };
  }

  return { page: 'apex' as const, sitename: getSitename(request), revision: null };
};

export const actions: Actions = {
  default: async ({ platform, request, url }) => {
    const site = getSite(url);
    if (site.kind !== 'apex') return fail(404, { error: 'Not found' });

    const form = await request.formData();
    const email = form.get('email');
    if (typeof email !== 'string') return fail(400, { error: 'Enter an email address' });

    const normalizedEmail = email.trim();
    const slug = getSlugFromEmail(normalizedEmail);
    if (!slug) return fail(400, { email: normalizedEmail, error: 'Enter a valid email address' });

    if (platform?.env.DB) {
      const participant = await getParticipantBySubdomain(platform.env.DB, slug);
      if (participant?.status === 'deleted') {
        return fail(404, { email: normalizedEmail, error: 'This participant site is inactive' });
      }
      if (participant && participant.email.toLowerCase() !== normalizedEmail.toLowerCase()) {
        return fail(409, {
          email: normalizedEmail,
          error: 'That address does not match the participant assigned to this site'
        });
      }
      if (!participant && (await resolveParticipantSite(platform.env.DB, slug)) === null) {
        return fail(404, { email: normalizedEmail, error: 'This participant site is inactive' });
      }
      await ensureSite(platform.env.DB, slug);
    }
    redirect(303, getSiteUrl(url, site.apexHostname, slug, '/'));
  }
};
