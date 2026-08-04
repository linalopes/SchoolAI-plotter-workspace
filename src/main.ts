import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { grblClient } from './lib/grbl/stores';

const target = document.getElementById('app');
if (!target) {
  throw new Error('The application root element #app was not found.');
}

const app = mount(App, { target });

/**
 * Release the serial port when the tab goes away.
 *
 * Without this, a reload can leave the previous page still holding the port,
 * and the new page cannot open it.
 */
window.addEventListener('pagehide', () => {
  void grblClient.dispose();
});

export default app;
