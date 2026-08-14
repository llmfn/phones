import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';

import { getAuthSecret, verifyCredential } from '$lib/server/auth';
import { SESSION_COOKIE } from '$lib/server/cookies';
import { getSite } from '$lib/server/hosts';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies, platform, url }) => {
  const site = getSite(url);
  if (site.kind === 'apex') redirect(303, '/');

  try {
    const secret = getAuthSecret(platform, dev);
    const valid = await verifyCredential(
      cookies.get(SESSION_COOKIE),
      'session',
      site.hostname,
      secret
    );
    if (valid) return { slug: site.slug };
  } catch {
    // Missing production configuration behaves like a signed-out session.
  }

  redirect(303, '/admin/login');
};

export const actions: Actions = {
  logout: ({ cookies, url }) => {
    cookies.delete(SESSION_COOKIE, {
      path: '/',
      secure: url.protocol === 'https:'
    });
    redirect(303, '/');
  }
};
