import { redirect } from '@sveltejs/kit';

import { getSite } from '$lib/server/hosts';
import { getSitename } from '$lib/server/sitename';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ request, url }) => {
  if (getSite(url).kind === 'apex') redirect(303, '/');

  return { sitename: getSitename(request) };
};
