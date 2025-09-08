// Imports the defineConfig helper from Vite.
import { defineConfig } from 'vite';
// Imports the React plugin for Vite.
import react from '@vitejs/plugin-react';

// Defines the Vite configuration.
// https://vitejs.dev/config/
export default defineConfig({
  // Configures Vite plugins.
  plugins: [react()],
  // Configures the development server.
  server: {
    // Tells Vite to automatically open the browser when the development server starts.
    open: true,
  },
});
