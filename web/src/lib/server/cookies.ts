import { LOGIN_CODE_TTL_SECONDS, SESSION_TTL_SECONDS } from './auth';

export const LOGIN_CHALLENGE_COOKIE = 'phones_login_challenge';
export const SESSION_COOKIE = 'phones_session';

function hostCookieOptions(url: URL) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: url.protocol === 'https:'
  };
}

export function sessionCookieOptions(url: URL) {
  return {
    ...hostCookieOptions(url),
    maxAge: SESSION_TTL_SECONDS
  };
}

export function loginChallengeCookieOptions(url: URL) {
  return {
    ...hostCookieOptions(url),
    maxAge: LOGIN_CODE_TTL_SECONDS
  };
}
