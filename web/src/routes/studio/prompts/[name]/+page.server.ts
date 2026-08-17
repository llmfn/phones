import { error } from '@sveltejs/kit';

import { loadPanel, logout, savePanel } from '$lib/server/studio';
import { PROMPTS, type PromptSpec } from '$lib/site-defaults';

import type { Actions, PageServerLoad, RequestEvent } from './$types';

function promptSpec(event: RequestEvent): PromptSpec {
  const spec = PROMPTS.find((prompt) => prompt.name === event.params.name);
  if (!spec) error(404, 'No such prompt');
  return spec;
}

export const load: PageServerLoad = async (event) => {
  const prompt = promptSpec(event);
  return { ...(await loadPanel(event)), prompt };
};

export const actions: Actions = {
  save: async (event) => {
    const { name } = promptSpec(event);
    const form = await event.request.formData();
    const text = form.get(name) ?? '';

    // Only this prompt changes; its siblings come forward from the live config
    // rather than from whatever this page was rendered with.
    const patch = (live: { prompts: Record<string, string> }) => ({
      prompts: { ...live.prompts, [name]: text }
    });

    return savePanel(event, patch, form.get('note'), `/studio/prompts/${name}`);
  },

  logout
};
