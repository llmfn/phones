import { redirect } from '@sveltejs/kit';

import { clearAdminSessionCookie } from '$lib/server/admin-auth';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(303, '/admin');

export const actions: Actions = {
  default: ({ cookies, url }) => {
    clearAdminSessionCookie(cookies, url);
    redirect(303, '/admin/login');
  }
};
