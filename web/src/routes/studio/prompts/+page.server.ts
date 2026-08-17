import { redirect } from '@sveltejs/kit';

import { PROMPTS } from '$lib/site-defaults';

import type { PageServerLoad } from './$types';

/** There is no Prompts page of its own — the rail lists the prompts. */
export const load: PageServerLoad = ({ url }) =>
  redirect(307, `/studio/prompts/${PROMPTS[0].name}${url.search}`);
