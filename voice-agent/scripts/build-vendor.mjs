// Bundles @elevenlabs/client into one browser file for the standalone demo page
// (web/demo/index.html maps the bare import to it). The React app does not need
// this: Vite resolves the import itself.

import { build } from 'esbuild';
import { resolve } from 'node:path';
import { AGENT_DIR } from '../lib/env.mjs';

await build({
  stdin: { contents: "export * from '@elevenlabs/client';", resolveDir: AGENT_DIR, loader: 'js' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  outfile: resolve(AGENT_DIR, 'web/vendor/elevenlabs-client.js'),
  logLevel: 'info',
});
