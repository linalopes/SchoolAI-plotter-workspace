/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  server: {
    // Web Serial requires a secure context; localhost qualifies.
    host: 'localhost',
    port: 5173,
  },
  test: {
    // The GRBL client registers a visibilitychange listener, so the tests need
    // a DOM even though none of them render a component.
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
