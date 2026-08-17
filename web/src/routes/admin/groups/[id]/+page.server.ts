import { error, fail, redirect } from '@sveltejs/kit';

import { getGroup, groupName, renameGroup } from '$lib/server/groups';
import {
  createParticipant,
  listParticipants,
  participantEmail,
  participantName,
  participantSubdomain,
  setParticipantStatus,
  SubdomainConflict,
  updateParticipant
} from '$lib/server/participants';

import type { Actions, PageServerLoad } from './$types';

function groupId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) error(404, 'Group not found');
  return id;
}

function participantId(value: FormDataEntryValue | null): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) error(404, 'Participant not found');
  return id;
}

export const load: PageServerLoad = async ({ params, platform }) => {
  const db = platform?.env.DB;
  if (!db) error(503, 'No database is bound');

  const group = await getGroup(db, groupId(params.id));
  if (!group) error(404, 'Group not found');
  return { group, participants: await listParticipants(db, group.id) };
};

export const actions: Actions = {
  rename: async ({ params, platform, request }) => {
    const db = platform?.env.DB;
    if (!db) error(503, 'No database is bound');

    const form = await request.formData();
    const name = groupName(form.get('name'));
    if (!name) return fail(400, { action: 'rename', error: 'Group name is required.' });

    const group = await renameGroup(db, groupId(params.id), name);
    if (!group) error(404, 'Group not found');
    redirect(303, `/admin/groups/${group.id}`);
  },

  addParticipant: async ({ params, platform, request }) => {
    const db = platform?.env.DB;
    if (!db) error(503, 'No database is bound');
    const id = groupId(params.id);
    if (!(await getGroup(db, id))) error(404, 'Group not found');

    const form = await request.formData();
    const name = participantName(form.get('name'));
    const submittedEmail = form.get('email');
    const email = participantEmail(submittedEmail);
    const values = {
      name: typeof form.get('name') === 'string' ? String(form.get('name')) : '',
      email: typeof submittedEmail === 'string' ? submittedEmail : ''
    };
    if (!email) return fail(400, { action: 'add', values, error: 'Enter a valid email address.' });

    try {
      await createParticipant(db, id, name, email);
    } catch (cause) {
      return fail(400, {
        action: 'add',
        values,
        error: cause instanceof Error ? cause.message : 'Could not add participant.'
      });
    }
    redirect(303, `/admin/groups/${id}`);
  },

  editParticipant: async ({ params, platform, request }) => {
    const db = platform?.env.DB;
    if (!db) error(503, 'No database is bound');
    const id = groupId(params.id);
    const form = await request.formData();
    const selected = participantId(form.get('participantId'));
    const submittedName = form.get('name');
    const submittedEmail = form.get('email');
    const submittedSubdomain = form.get('subdomain');
    const name = participantName(submittedName);
    const email = participantEmail(submittedEmail);
    const subdomain = participantSubdomain(submittedSubdomain);
    const values = {
      name: typeof submittedName === 'string' ? submittedName : '',
      email: typeof submittedEmail === 'string' ? submittedEmail : '',
      subdomain: typeof submittedSubdomain === 'string' ? submittedSubdomain : ''
    };
    if (!email || !subdomain) {
      return fail(400, {
        action: 'edit',
        participantId: selected,
        values,
        error: !email ? 'Enter a valid email address.' : 'Enter a valid subdomain.'
      });
    }

    try {
      const participant = await updateParticipant(db, id, selected, { name, email, subdomain });
      if (!participant) error(404, 'Participant not found');
    } catch (cause) {
      if (!(cause instanceof SubdomainConflict)) throw cause;
      return fail(409, {
        action: 'edit',
        participantId: selected,
        values,
        error: 'That subdomain is already assigned.'
      });
    }
    redirect(303, `/admin/groups/${id}`);
  },

  deleteParticipant: async ({ params, platform, request }) => {
    const db = platform?.env.DB;
    if (!db) error(503, 'No database is bound');
    const id = groupId(params.id);
    const form = await request.formData();
    if (!(await setParticipantStatus(db, id, participantId(form.get('participantId')), 'deleted'))) {
      error(404, 'Participant not found');
    }
    redirect(303, `/admin/groups/${id}`);
  },

  restoreParticipant: async ({ params, platform, request }) => {
    const db = platform?.env.DB;
    if (!db) error(503, 'No database is bound');
    const id = groupId(params.id);
    const form = await request.formData();
    if (!(await setParticipantStatus(db, id, participantId(form.get('participantId')), 'active'))) {
      error(404, 'Participant not found');
    }
    redirect(303, `/admin/groups/${id}`);
  }
};
