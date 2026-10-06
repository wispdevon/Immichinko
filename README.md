# Immichinko

Rediscover your photo library through a daily session of ten photographs. Favorite saves directly to Immich; Pass and Later only change local cooldowns. Sessions survive refreshes, restarts and midnight. Undo checks the photo's current favorite state before restoring it. Progress shows seven-day review counts and a quiet completion streak.

Built with SvelteKit, TypeScript, Tailwind and actual `@immich/ui` components. Apache-2.0 licensed. Intended for one personal Immich account on a private network or behind your existing authentication proxy.

![Today, light theme](docs/screenshots/today-desktop.png)

## Run with Docker Compose

1. Create a dedicated Immich API key with **asset.read**, **asset.view** and **asset.update** permissions. Never use a key copied into frontend code.
2. Copy `.env.example` to `.env`. Set `IMMICH_URL` to your Immich server root URL, **without `/api`**, and set `IMMICH_API_KEY`. Use a hostname reachable both from the container and your browser, so “Open in Immich” works. Container `localhost` refers to the container itself.
3. Set `ORIGIN` to the exact URL you will open in the browser, including the port. It defaults to `http://localhost:3000`. Configure `BIND_ADDRESS` if using a private LAN interface; the default is loopback.
4. Start the app:

   ```sh
   docker compose up -d --build
   ```

Open the configured origin. Under Settings, click **Check connection**, then open Today. Connection settings are read from the server environment; after changing `.env`, recreate the container with `docker compose up -d --force-recreate`.

For a reverse proxy, set `ORIGIN=https://photos-review.example.com` and keep the application port bound to loopback. Supply your existing proxy authentication. There is no built-in login, so anyone who can reach this app can review and favorite photos with the configured key.

The `rediscovery` Docker volume holds SQLite metadata and its durable write journal. No photo files are saved by the app; preview bytes are streamed from Immich with private, no-store caching. Run **one app instance per database**: changes are serialized inside that process. Horizontal replicas sharing a volume are unsupported.

To back up, stop the app, copy the volume contents (including SQLite WAL files if present), then start it again. Keep the key separate from backups of the database. `docker compose down` preserves the volume; adding `--volumes` removes your rediscovery history.

## Development

Use **Node 22.13 or later in the Node 22 series** and **pnpm 10.18.3**:

```sh
corepack enable
corepack prepare pnpm@10.18.3 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

Vite reads `.env` during development. Open its printed local URL. Production runs with `pnpm build` and `node build`; provide environment variables to that process explicitly, because the production adapter does not load `.env` automatically. Set `PORT`, `HOST`, `ORIGIN`, `TZ`, and `DATABASE_PATH` as appropriate.

## Daily selection

- Six photos older than one calendar year, three from the past year, one eligible photo previously marked Later.
- Up to three random searches of 100 candidates for each date category. Results are deduplicated, and different capture days are preferred within each category. Missing quotas are filled from remaining eligible candidates; a small library can produce fewer than ten photos.
- Only available, nonfavorite images in timeline visibility are eligible. Trash, archive, hidden/locked assets, offline files, video and secondary stack images are excluded. Assets are rechecked before display, preview and decisions.
- **Pass** suppresses the photo for 90 calendar days. **Later** suppresses it for seven. Neither action writes to Immich. Favorite saves immediately and favorite photos remain excluded.
- Default timezone is **Asia/Bangkok**, configurable through `TZ`. One batch is created per local day, but an unfinished batch is resumed first. A batch completed after midnight earns credit on the completion day and the next batch waits until the following day.
- Successful, non-undone decisions count once. Completing any nonempty batch earns one streak day; an empty batch does not. Deleted, inaccessible or externally favorited photos are skipped without review credit.

Keyboard: **F** Favorite, **P** Pass, **L** Later, **U** Undo. Buttons support Tab and Enter/Space. Controls wait for the preview to load; a failed preview can be retried. Light, dark and system themes and reduced motion are supported.

## Save recovery and Undo

A Favorite or favorite Undo is journaled in SQLite before the outgoing write. Writes set the desired boolean state, so retries are idempotent. The next session operation reconciles an interrupted request: if Immich already has the desired state, the local decision is finalized once; otherwise the write is retried only if the previous favorite state and update timestamp still match. Retryable connection errors keep the journal. Definitive denied/deleted requests clear it and leave the decision uncounted. Confirmed external conflicts cancel the pending operation; reload Today.

Undo applies to the most recent active decision in that batch. It restores the previous local cooldown and, for Favorite, the prior favorite state. A changed Immich update timestamp or favorite state blocks a favorite Undo. Immich v3.2.4 does not offer a conditional favorite update in the verified endpoint, so a change occurring between the final read and the write cannot be prevented atomically. A timed-out write already at its target state is considered reconciled, even if another client independently set the same state.

## API compatibility and validation

The API request contracts were checked against the [Immich v3.2.4 OpenAPI schema](https://github.com/immich-app/immich/blob/v3.2.4/open-api/immich-openapi-specs.json). Random search uses the v3.2 `filter` format and preview size `preview`; favorite writes use `PUT /api/assets/{id}`. `@immich/ui` is pinned to **0.86.0**, the compatible version referenced by [v3.2.4's web package](https://github.com/immich-app/immich/blob/v3.2.4/web/package.json).

```sh
pnpm format:check
pnpm check
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
```

Browser tests start a local HTTP Immich fixture and the production build on ports 4311 and 4310. They do not use real credentials. Screenshots are written to `docs/screenshots`; tests use a deterministic SVG by default. To capture photographic examples, set `FIXTURE_PHOTO` to a local JPEG while running `pnpm test:browser`. Fixtures use fictional dates/locations. The committed photographic screenshots use NASA's Apollo 8 Earthrise image, AS08-14-2383; they are UI evidence, not live library integration. [NASA image source](https://images.nasa.gov/details/as08-14-2383).

See [validation results](docs/VALIDATION.md) and [design rationale](DESIGN.md). Read-only search and previews have been verified against a configured **Immich 3.2.0** server. Live Favorite writes and Undo remain unverified until exercised by the user. The v3.2 filter format excludes the deprecated `withDeleted` field; trash is filtered with `trashedAt: { eq: null }`. Docker Compose configuration was validated; container build/run was unavailable in this workspace because access to the Docker daemon socket was denied.

Notifications, AI ranking, multiple profiles and native Immich UI injection are outside this version. Dependency licenses are listed in [NOTICE](NOTICE); original app source is covered by [LICENSE](LICENSE).
