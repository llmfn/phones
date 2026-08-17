import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

// The admin page became the studio; the old address still has bookmarks on it.
export const load: PageServerLoad = () => redirect(308, '/studio');
