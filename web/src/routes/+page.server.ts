import { fail, redirect } from '@sveltejs/kit';

import { getSite, getSiteUrl, getSlugFromEmail } from '$lib/server/hosts';
import { getSitename } from '$lib/server/sitename';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ request, url }) => {
  const site = getSite(url);

  if (site.kind === 'instance') {
    return { page: 'app' as const, sitename: getSitename(request) };
  }

  return { page: 'apex' as const, sitename: getSitename(request) };
};

export const actions: Actions = {
  default: async ({ request, url }) => {
    const site = getSite(url);
    if (site.kind !== 'apex') return fail(404, { error: 'Not found' });

    const form = await request.formData();
    const email = form.get('email');
    if (typeof email !== 'string') return fail(400, { error: 'Enter an email address' });

    const normalizedEmail = email.trim();
    const slug = getSlugFromEmail(normalizedEmail);
    if (!slug) return fail(400, { email: normalizedEmail, error: 'Enter a valid email address' });

    redirect(303, getSiteUrl(url, site.apexHostname, slug, '/'));
  }
};
