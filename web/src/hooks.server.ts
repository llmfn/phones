import { resolveSiteConfig } from '$lib/server/site-config';

import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.config = resolveSiteConfig();
  return resolve(event);
};
