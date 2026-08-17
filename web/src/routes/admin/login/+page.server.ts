import { fail, redirect } from '@sveltejs/kit';

import {
  createAdminSession,
  setAdminSessionCookie,
  verifyAdminPasscode
} from '$lib/server/admin-auth';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.admin) redirect(303, '/admin');
};

export const actions: Actions = {
  default: async ({ cookies, platform, request, url }) => {
    const passcode = platform?.env.ADMIN_PASSCODE;
    const secret = platform?.env.ADMIN_SESSION_SECRET;
    if (!passcode || !secret) {
      return fail(500, { error: 'Admin login is not configured.' });
    }

    const form = await request.formData();
    if (!(await verifyAdminPasscode(form.get('passcode'), passcode))) {
      return fail(400, { error: 'Passcode is incorrect.' });
    }

    let token;
    try {
      token = await createAdminSession(secret);
    } catch {
      return fail(500, { error: 'Admin login is not configured.' });
    }

    setAdminSessionCookie(cookies, token, url);
    redirect(303, '/admin');
  }
};
