import { loadPanel, logout, savePanel } from '$lib/server/studio';
import { SEARCH_PARAM_NAMES } from '$lib/site-defaults';

import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => loadPanel(event);

export const actions: Actions = {
  save: async (event) => {
    const form = await event.request.formData();

    // Every knob the form carries is offered to the parser, rather than only
    // the ones the chosen method knows, so a param from another method is a
    // rejected save instead of a field silently dropped.
    const search_params: Record<string, unknown> = {};
    for (const name of SEARCH_PARAM_NAMES) {
      const value = form.get(name);
      if (typeof value === 'string' && value.trim() !== '') {
        search_params[name] = Number(value);
      }
    }

    const search = { method: form.get('method') ?? undefined, search_params };
    return savePanel(event, () => ({ search }), form.get('note'), '/studio');
  },

  logout
};
