import { dev } from '$app/environment';
import { fail, redirect } from '@sveltejs/kit';

import {
  createLoginChallenge,
  generateLoginCode,
  getAuthSecret,
  LOGIN_CODE_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  signCredential,
  verifyLoginChallenge
} from '$lib/server/auth';
import {
  loginChallengeCookieOptions,
  LOGIN_CHALLENGE_COOKIE,
  sessionCookieOptions,
  SESSION_COOKIE
} from '$lib/server/cookies';
import { getMaskedOwnerEmail, getOwnerEmail, getSite } from '$lib/server/hosts';
import { deliverLoginCode } from '$lib/server/mail';
import { getParticipantEmail } from '$lib/server/participants';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, url }) => {
  const site = getSite(url);
  if (site.kind === 'apex') redirect(303, '/');

  const email = platform?.env.DB
    ? await getParticipantEmail(platform.env.DB, site.slug)
    : null;
  return { maskedEmail: email ? maskEmail(email) : getMaskedOwnerEmail(site.slug) };
};

function maskEmail(email: string): string {
  const separator = email.lastIndexOf('@');
  return `${email.slice(0, 1)}***${email.slice(separator)}`;
}

export const actions: Actions = {
  send: async ({ cookies, platform, url }) => {
    const site = getSite(url);
    if (site.kind === 'apex') return fail(404, { error: 'Not found' });

    try {
      const secret = getAuthSecret(platform, dev);
      const code = generateLoginCode();
      const challenge = await createLoginChallenge(
        site.hostname,
        code,
        secret,
        LOGIN_CODE_TTL_SECONDS
      );
      const recipient = platform?.env.DB
        ? (await getParticipantEmail(platform.env.DB, site.slug)) ?? getOwnerEmail(site.slug)
        : getOwnerEmail(site.slug);
      await deliverLoginCode(recipient, code, platform?.env.EMAIL, dev);
      cookies.set(
        LOGIN_CHALLENGE_COOKIE,
        challenge,
        loginChallengeCookieOptions(url)
      );
      return { sent: true };
    } catch (error) {
      console.error('Could not send login code', error);
      return fail(502, { error: 'Could not send the code. Try again.' });
    }
  },

  verify: async ({ cookies, platform, request, url }) => {
    const site = getSite(url);
    if (site.kind === 'apex') return fail(404, { error: 'Not found' });

    const form = await request.formData();
    const submittedCode = form.get('code');
    const code = typeof submittedCode === 'string' ? submittedCode.trim() : '';

    try {
      const secret = getAuthSecret(platform, dev);
      const valid = await verifyLoginChallenge(
        cookies.get(LOGIN_CHALLENGE_COOKIE),
        site.hostname,
        code,
        secret
      );
      if (!valid) return fail(400, { sent: true, error: 'Enter the current six-digit code' });

      const session = await signCredential(
        'session',
        site.hostname,
        secret,
        SESSION_TTL_SECONDS
      );
      cookies.set(SESSION_COOKIE, session, sessionCookieOptions(url));
      cookies.delete(LOGIN_CHALLENGE_COOKIE, {
        path: '/',
        secure: url.protocol === 'https:'
      });
    } catch (error) {
      console.error('Could not verify login code', error);
      return fail(500, { sent: true, error: 'Could not verify the code. Try again.' });
    }

    redirect(303, '/studio');
  }
};
