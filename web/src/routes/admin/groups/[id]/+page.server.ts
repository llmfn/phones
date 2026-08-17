import { error, fail, redirect } from '@sveltejs/kit';

import { getGroup, groupName, renameGroup } from '$lib/server/groups';

import type { Actions, PageServerLoad } from './$types';

function groupId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) error(404, 'Group not found');
  return id;
}

export const load: PageServerLoad = async ({ params, platform }) => {
  const db = platform?.env.DB;
  if (!db) error(503, 'No database is bound');

  const group = await getGroup(db, groupId(params.id));
  if (!group) error(404, 'Group not found');
  return { group };
};

export const actions: Actions = {
  rename: async ({ params, platform, request }) => {
    const db = platform?.env.DB;
    if (!db) error(503, 'No database is bound');

    const form = await request.formData();
    const name = groupName(form.get('name'));
    if (!name) return fail(400, { error: 'Group name is required.' });

    const group = await renameGroup(db, groupId(params.id), name);
    if (!group) error(404, 'Group not found');
    redirect(303, `/admin/groups/${group.id}`);
  }
};
