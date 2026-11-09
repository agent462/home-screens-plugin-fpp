import { defineConfig } from 'vite';

// Audit harness build: a normal self-contained page (React bundled), unlike
// the shipped IIFE bundle. Mounts the real views with fixture data so they can
// be screenshotted against the design mockup. Output is git-ignored.
export default defineConfig({
  root: 'audit',
  base: './',
  build: {
    outDir: '../audit-dist',
    emptyOutDir: true,
  },
  esbuild: {
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
  },
});
