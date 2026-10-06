import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/integration-browser',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4312',
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
        'DATABASE_PATH=/tmp/immichinko-integration.sqlite IMMICH_URL=http://127.0.0.1:4311 IMMICH_PUBLIC_URL=http://127.0.0.1:4312 IMMICH_API_KEY=fixture-secret TZ=Asia/Bangkok ORIGIN=http://127.0.0.1:4312 PORT=4313 node build-integrated',
      url: 'http://127.0.0.1:4313/immichinko',
      reuseExistingServer: false,
    },
    {
      command:
        'IMMICH_UPSTREAM_URL=http://127.0.0.1:4311 IMMICHINKO_UPSTREAM_URL=http://127.0.0.1:4313 IMMICH_OWNER_ID=fixture-owner ORIGIN=http://127.0.0.1:4312 PORT=4312 node integrations/server/gateway.mjs',
      url: 'http://127.0.0.1:4312/login',
      reuseExistingServer: false,
    },
  ],
});
