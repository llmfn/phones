import { json } from '@sveltejs/kit';

import { parseFilters } from '$lib/filters';
import { getSite } from '$lib/server/hosts';
import { search } from '$lib/server/search/app';

import type { RequestHandler } from './$types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const POST: RequestHandler = async ({ request, locals, url }) => {
  if (getSite(url).kind !== 'instance') return json({ error: 'Not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  if (!isRecord(body)) return json({ error: 'Request body must be an object' }, { status: 400 });

  const query = body.query ?? '';
  if (typeof query !== 'string') return json({ error: 'query must be a string' }, { status: 400 });

  let filters;
  try {
    filters = parseFilters(body.filters);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, { status: 400 });
  }
  return json(await search(query, filters, locals.config));
};
