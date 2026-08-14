import { getSitename } from '$lib/server/sitename';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ request }) => ({
  sitename: getSitename(request)
});
