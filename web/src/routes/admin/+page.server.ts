import { error, fail, redirect } from '@sveltejs/kit';

import { createGroup, groupName, listGroups } from '$lib/server/groups';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env.DB;
  if (!db) error(503, 'No database is bound');
  return { groups: await listGroups(db) };
};

export const actions: Actions = {
  create: async ({ platform, request }) => {
    const db = platform?.env.DB;
    if (!db) error(503, 'No database is bound');

    const form = await request.formData();
    const name = groupName(form.get('name'));
    if (!name) return fail(400, { error: 'Group name is required.' });

    const group = await createGroup(db, name);
    redirect(303, `/admin/groups/${group.id}`);
  }
};
