import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The voice agent's token server (voice-agent/server). It listens on 127.0.0.1 only,
// so name the address: "localhost" can resolve to ::1 and miss it.
const voiceServer = 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    // voice-agent/web/voice.js lives beside app/, outside the Vite root.
    fs: { allow: ['..'] },
    proxy: { '/voice-api': voiceServer },
  },
  preview: {
    port: 5173,
    strictPort: true,
    proxy: { '/voice-api': voiceServer },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
