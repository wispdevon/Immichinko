import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4310',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command: 'node tests/fixture-server.mjs',
      url: 'http://127.0.0.1:4311/fixture/stats',
      reuseExistingServer: false,
    },
    {
      command:
        'DATABASE_PATH=/tmp/immichinko-e2e.sqlite IMMICH_URL=http://127.0.0.1:4311 IMMICH_API_KEY=fixture-secret TZ=Asia/Bangkok ORIGIN=http://127.0.0.1:4310 PORT=4310 node build',
      url: 'http://127.0.0.1:4310',
      reuseExistingServer: false,
    },
  ],
});
