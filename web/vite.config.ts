import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    allowedHosts: ['.local.pipal.in']
  },
  preview: {
    allowedHosts: ['.local.pipal.in']
  }
});
