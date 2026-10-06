# Sidebar integration

This gateway adds **Immichinko** directly after **Sharing** in Immich's desktop and mobile sidebar. Clicking it keeps Immich's navigation visible and mounts the review app in the main area. Back, forward, refreshing the embedded view and switching Immich sections restore the original timeline. The embedded view follows Immich's theme when its appearance setting is System.

It uses a small DOM integration script, anchored to the actual `/sharing` link and `#sidebar` markup in [Immich v3.2.0 UserSidebar](https://github.com/immich-app/immich/blob/v3.2.0/web/src/lib/components/shared-components/side-bar/UserSidebar.svelte) and [UserPageLayout](https://github.com/immich-app/immich/blob/v3.2.0/web/src/lib/components/layouts/UserPageLayout.svelte). It does not replace Immich's image, web bundles or database. Other Immich requests, uploads, previews and Socket.IO upgrades continue to the original server.

## Deployment

1. Build the mounted companion on a workstation with Node 22 and pnpm:

   ```sh
   pnpm install --frozen-lockfile
   pnpm build:integrated
   ```

2. Transfer the generated `build-integrated` directory, `package.json`, `pnpm-lock.yaml`, `.dockerignore`, `compose.integrated.yaml`, `integrations/server` and `static/integrations` to the deployment host. The app image installs its runtime dependencies for the host architecture; Svelte compilation has already happened. This reduces build memory use on a Raspberry Pi.
3. Create a mode-0600 `.env.integration` in that deployment directory using `environment.example`. Set `IMMICH_UPSTREAM_URL` to the **internal** original Immich server address, not the public domain pointing at this gateway. Set `ORIGIN` to the public HTTPS Immich origin. Set `IMMICH_OWNER_ID` to the UUID of the library owner associated with the dedicated key. The key can read that ID from `GET /api/users/me` with `user.read`; the browser uses the existing Immich session and never receives the dedicated key.
4. Join the existing Immich Docker network via `IMMICH_NETWORK`, then start:

   ```sh
   docker compose -p immichinko --env-file .env.integration -f compose.integrated.yaml up -d --build
   ```

5. Point only the Immich domain's reverse-proxy upstream at `http://127.0.0.1:3101`. When the proxy is on another host, set `INTEGRATION_BIND` to a private LAN address and use that address instead of loopback. Keep its TLS configuration. For Caddy, change that site's `reverse_proxy` target, validate the configuration, and reload Caddy. Preserve a copy of its previous configuration for rollback.
6. Refresh Immich, sign in as the configured owner, and choose **Immichinko** below Sharing.

The companion is mounted at `/immichinko/`. The gateway serves the public, credential-free sidebar script at `/immichinko/integration/sidebar.js`. Every other companion request—including previews and API mutations—checks the caller's existing Immich session against `GET /api/users/me` and requires the configured owner UUID. Other signed-in users and anonymous visitors receive 401. The app itself has no published host port; the gateway defaults to a loopback port for the existing TLS proxy; a proxy on another host can use a configured private LAN interface. One SQLite volume stores this owner's review history.

The integration gateway also accepts an existing Immich bearer token or API key for authenticated API diagnostics. It does not mint sessions or send its configured key to browsers. Mutations continue to require same-origin JSON. Normal Immich authentication stays with Immich.

To rollback, restore the original reverse-proxy target (for example `127.0.0.1:2283`) and reload it. The original Immich service has not been edited. Stop the integration's Compose project without deleting its volume to preserve review history. After updating Immich, verify that the Sharing entry and primary sidebar/main layout are still present; this is a maintained DOM integration rather than an upstream plugin API.

## Browser-only option

`static/integrations/immichinko.user.js` can also be installed through a userscript manager for personal, local use. Its default match is the user's Immich domain and its default companion address is `http://localhost:3100/`. That mode requires the local app to stay running, and browser privacy or local-network restrictions may block the iframe. The server gateway is the deployed solution and uses an HTTPS same-origin iframe.

The script contains no API key. A server-injected `<script>` configures its companion URL with `data-app-url`. The gateway provides this automatically.

## Validation

```sh
pnpm test
pnpm check
pnpm build:integrated
pnpm test:integration
```

Tests cover anonymous and other-account denial, owner authorization, preserved proxy paths and methods, HTML injection, binary pass-through, and the embedded desktop/mobile workflow. Browser fixtures use the reviewed Immich markup and a deterministic preview or an optional `FIXTURE_PHOTO` JPEG. They do not use the live library.
